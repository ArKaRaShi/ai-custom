import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { authoredSkills, classify } from "@/scripts/report";

const tempDirs: string[] = [];
const cli = path.join(import.meta.dir, "..", "scripts", "report.ts");

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const RULES_BODY = "## Rules\n\n- Do x.\n\n## The tests\n\n- Did x?";

/** Writes `<skillsDir>/<dir>/SKILL.md` with the given frontmatter name, description, and body. */
function writeSkill(skillsDir: string, dir: string, name: string, description: string, body: string): void {
  fs.mkdirSync(path.join(skillsDir, dir), { recursive: true });
  fs.writeFileSync(
    path.join(skillsDir, dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`,
  );
}

interface Entry {
  path: string;
  origin: "authored" | "external";
  kind?: string;
  root?: string;
}

const manifestOf = (entries: Entry[]): string =>
  JSON.stringify({
    version: 2,
    entries: entries.map((e) => ({
      kind: e.kind ?? "skill",
      root: e.root ?? "agents",
      path: e.path,
      sync: true,
      skill: { origin: e.origin },
    })),
  });

/** A skills dir holding one skill per status, plus an external skill that would fail if checked. */
function makeWorkspace(options: { withErrors: boolean }): { manifest: string; skillsDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "report-"));
  tempDirs.push(root);
  const skillsDir = path.join(root, "skills");
  const goodDesc = "Does a job. Use when needed.";
  writeSkill(skillsDir, "fine", "fine", goodDesc, RULES_BODY);
  writeSkill(skillsDir, "chatty", "chatty", "Does a job.", RULES_BODY);
  writeSkill(skillsDir, "older", "older", goodDesc, "## Notes\n\ntext");
  writeSkill(skillsDir, "external-bad", "mismatch", goodDesc, "## Notes\n\ntext");
  const entries: Entry[] = [
    { path: "fine", origin: "authored" },
    { path: "chatty", origin: "authored" },
    { path: "older", origin: "authored" },
    { path: "external-bad", origin: "external" },
    { path: "retired", origin: "authored" },
    { path: "elsewhere", origin: "authored", root: "omp" },
  ];
  if (options.withErrors) {
    writeSkill(skillsDir, "broken", "other-name", goodDesc, RULES_BODY);
    entries.push({ path: "broken", origin: "authored" });
  }
  const manifest = path.join(root, "manifest.json");
  fs.writeFileSync(manifest, manifestOf(entries));
  return { manifest, skillsDir };
}

const run = (...args: string[]): { code: number | null; out: string; err: string } => {
  const r = Bun.spawnSync(["bun", cli, ...args]);
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
};

describe("given a manifest, when authored skills are read, then only authored agent skills are listed", () => {
  it("keeps manifest order and drops external, non-skill, and other-root entries", () => {
    const text = manifestOf([
      { path: "b", origin: "authored" },
      { path: "ext", origin: "external" },
      { path: "c", origin: "authored", kind: "path" },
      { path: "d", origin: "authored", root: "omp" },
      { path: "a", origin: "authored" },
    ]);
    expect(authoredSkills(text)).toEqual(["b", "a"]);
  });

  it("rejects text that is not a manifest with an error naming the problem", () => {
    expect(() => authoredSkills("not json")).toThrow("not valid JSON");
    expect(() => authoredSkills('{"version":2}')).toThrow("no `entries` array");
  });
});

describe("given validator findings, when classified, then the status matches the worst finding", () => {
  const warning = (message: string) => ({ level: "warning" as const, file: "SKILL.md", message });
  const error = (message: string) => ({ level: "error" as const, file: "SKILL.md", message });

  it("maps no findings to ok and a lone missing-main-section warning to legacy shape", () => {
    expect(classify([])).toEqual({ kind: "ok" });
    expect(classify([warning("missing `## Steps` or `## Rules` main section")])).toEqual({ kind: "legacy shape" });
  });

  it("counts warnings, and lets errors outrank everything", () => {
    expect(classify([warning("missing `## Steps` or `## Rules` main section"), warning("other")])).toEqual({
      kind: "warnings",
      count: 2,
    });
    expect(classify([warning("other")])).toEqual({ kind: "warnings", count: 1 });
    expect(classify([warning("missing `## Steps` or `## Rules` main section"), error("bad")])).toEqual({
      kind: "errors",
      count: 1,
    });
  });
});

describe("given the command line, when run on a fixture manifest, then each skill gets one status line", () => {
  it("prints ok, warnings, legacy shape, and a summary, and exits 0 without errors", () => {
    const { manifest, skillsDir } = makeWorkspace({ withErrors: false });
    const result = run("--manifest", manifest, "--skills-dir", skillsDir);
    expect(result.code).toBe(0);
    expect(result.out.trim().split("\n")).toEqual([
      "fine: ok",
      "chatty: warnings (1)",
      "older: legacy shape",
      "3 authored skills: 1 ok, 1 warnings, 1 legacy shape, 0 errors (1 without a local folder skipped)",
    ]);
  });

  it("prints an errors line and exits 1 when any authored skill has errors", () => {
    const { manifest, skillsDir } = makeWorkspace({ withErrors: true });
    const result = run("--manifest", manifest, "--skills-dir", skillsDir);
    expect(result.code).toBe(1);
    expect(result.out).toContain("broken: errors (1)");
    expect(result.out).toContain("4 authored skills: 1 ok, 1 warnings, 1 legacy shape, 1 errors");
  });

  it("skips external skills and authored entries with no local folder", () => {
    const { manifest, skillsDir } = makeWorkspace({ withErrors: false });
    const result = run("--manifest", manifest, "--skills-dir", skillsDir);
    expect(result.out).not.toContain("external-bad");
    expect(result.out).not.toContain("retired");
    expect(result.out).not.toContain("elsewhere");
  });

  it("reads the manifest from $AI_CUSTOM_REPO when --manifest is absent", () => {
    const { manifest, skillsDir } = makeWorkspace({ withErrors: false });
    const repo = path.join(path.dirname(manifest), "repo");
    fs.mkdirSync(path.join(repo, ".ai-sync"), { recursive: true });
    fs.copyFileSync(manifest, path.join(repo, ".ai-sync", "manifest.json"));
    const r = Bun.spawnSync(["bun", cli, "--skills-dir", skillsDir], { env: { ...process.env, AI_CUSTOM_REPO: repo } });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.toString()).toContain("fine: ok");
  });

  it("exits non-zero with a clear message for an unreadable or malformed manifest", () => {
    const { manifest, skillsDir } = makeWorkspace({ withErrors: false });
    const missing = run("--manifest", `${manifest}.nope`, "--skills-dir", skillsDir);
    expect(missing.code).toBe(2);
    expect(missing.err).toContain("cannot use manifest");
    const malformed = path.join(path.dirname(manifest), "bad.json");
    fs.writeFileSync(malformed, "{oops");
    const broken = run("--manifest", malformed, "--skills-dir", skillsDir);
    expect(broken.code).toBe(2);
    expect(broken.err).toContain("not valid JSON");
    expect(broken.out).toBe("");
  });

  it("exits 2 on an unknown argument and never modifies the skills it checks", () => {
    const { manifest, skillsDir } = makeWorkspace({ withErrors: false });
    const before = fs.readFileSync(path.join(skillsDir, "fine", "SKILL.md"), "utf8");
    expect(run("--bogus").code).toBe(2);
    run("--manifest", manifest, "--skills-dir", skillsDir);
    expect(fs.readFileSync(path.join(skillsDir, "fine", "SKILL.md"), "utf8")).toBe(before);
    expect(fs.readdirSync(path.join(skillsDir, "fine"))).toEqual(["SKILL.md"]);
  });
});

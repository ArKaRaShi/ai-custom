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

/** A skills dir holding one skill per status, plus a loose file and a hidden folder that must be ignored. */
function makeWorkspace(options: { withErrors: boolean }): { skillsDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "report-"));
  tempDirs.push(root);
  const skillsDir = path.join(root, "skills");
  const goodDesc = "Does a job. Use when needed.";
  writeSkill(skillsDir, "fine", "fine", goodDesc, RULES_BODY);
  writeSkill(skillsDir, "chatty", "chatty", "Does a job.", RULES_BODY);
  writeSkill(skillsDir, "older", "older", goodDesc, "## Notes\n\ntext");
  writeSkill(skillsDir, ".hidden", "mismatch", goodDesc, "## Notes\n\ntext");
  fs.writeFileSync(path.join(skillsDir, "notes.txt"), "not a skill");
  if (options.withErrors) writeSkill(skillsDir, "broken", "other-name", goodDesc, RULES_BODY);
  return { skillsDir };
}

const run = (...args: string[]): { code: number | null; out: string; err: string } => {
  const r = Bun.spawnSync(["bun", cli, ...args]);
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
};

describe("given a skills folder, when authored skills are read, then every visible folder is listed", () => {
  it("lists folders alphabetically and drops files and hidden folders", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "report-list-"));
    tempDirs.push(dir);
    for (const name of ["b", "a", ".hidden"]) fs.mkdirSync(path.join(dir, name));
    fs.writeFileSync(path.join(dir, "notes.txt"), "not a skill");
    expect(authoredSkills(dir)).toEqual(["a", "b"]);
  });

  it("throws when the folder does not exist", () => {
    expect(() => authoredSkills(path.join(os.tmpdir(), "report-no-such-dir"))).toThrow();
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

describe("given the command line, when run on a skills folder, then each skill gets one status line", () => {
  it("prints ok, warnings, legacy shape, and a summary, and exits 0 without errors", () => {
    const { skillsDir } = makeWorkspace({ withErrors: false });
    const result = run("--skills-dir", skillsDir);
    expect(result.code).toBe(0);
    expect(result.out.trim().split("\n")).toEqual([
      "chatty: warnings (1)",
      "fine: ok",
      "older: legacy shape",
      "3 authored skills: 1 ok, 1 warnings, 1 legacy shape, 0 errors",
    ]);
  });

  it("prints an errors line and exits 1 when any authored skill has errors", () => {
    const { skillsDir } = makeWorkspace({ withErrors: true });
    const result = run("--skills-dir", skillsDir);
    expect(result.code).toBe(1);
    expect(result.out).toContain("broken: errors (1)");
    expect(result.out).toContain("4 authored skills: 1 ok, 1 warnings, 1 legacy shape, 1 errors");
  });

  it("reads <repo>/.agents/skills from $AI_CUSTOM_REPO when --skills-dir is absent", () => {
    const { skillsDir } = makeWorkspace({ withErrors: false });
    const repo = path.join(path.dirname(skillsDir), "repo");
    fs.mkdirSync(path.join(repo, ".agents"), { recursive: true });
    fs.cpSync(skillsDir, path.join(repo, ".agents", "skills"), { recursive: true });
    const r = Bun.spawnSync(["bun", cli], { env: { ...process.env, AI_CUSTOM_REPO: repo } });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.toString()).toContain("fine: ok");
  });

  it("exits 2 with a clear message when the skills folder cannot be read", () => {
    const { skillsDir } = makeWorkspace({ withErrors: false });
    const result = run("--skills-dir", `${skillsDir}-nope`);
    expect(result.code).toBe(2);
    expect(result.err).toContain("cannot read skills dir");
    expect(result.out).toBe("");
  });

  it("exits 2 on an unknown argument and never modifies the skills it checks", () => {
    const { skillsDir } = makeWorkspace({ withErrors: false });
    const before = fs.readFileSync(path.join(skillsDir, "fine", "SKILL.md"), "utf8");
    expect(run("--bogus").code).toBe(2);
    run("--skills-dir", skillsDir);
    expect(fs.readFileSync(path.join(skillsDir, "fine", "SKILL.md"), "utf8")).toBe(before);
    expect(fs.readdirSync(path.join(skillsDir, "fine"))).toEqual(["SKILL.md"]);
  });
});

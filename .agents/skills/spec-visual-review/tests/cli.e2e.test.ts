import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseSpec, translatables } from "@/scripts/domain/spec";
import { goodThai, SPEC } from "./fixtures";

const CLI = path.resolve(import.meta.dir, "..", "scripts", "cli.ts");
const MODEL_TESTS = process.env.SPEC_VISUAL_REVIEW_MODEL === "1";

let home: string;
let work: string;
let spec: string;
let reviewDir: string;

interface Run {
  code: number;
  out: string;
  err: string;
}

async function cli(...args: string[]): Promise<Run> {
  const child = Bun.spawn(["bun", CLI, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      HOME: home,
      XDG_CACHE_HOME: path.join(home, ".cache"),
      HF_HOME: path.join(home, ".hf"),
    },
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, out, err };
}

function seedThai(): void {
  const entries: Record<string, { en: string; th: string }> = {};
  for (const item of translatables(parseSpec(SPEC)))
    entries[item.key] = { en: item.text, th: goodThai(item.text) };
  fs.mkdirSync(reviewDir, { recursive: true });
  fs.writeFileSync(
    path.join(reviewDir, "thai.json"),
    JSON.stringify({ model: "seed", entries, overrides: {} }),
  );
}

beforeAll(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "svr-home-"));
  work = fs.mkdtempSync(path.join(os.tmpdir(), "svr-work-"));
  spec = path.join(work, "spec.md");
  reviewDir = path.join(work, ".visual-review");
  fs.writeFileSync(spec, SPEC);
});

afterAll(() => {
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(work, { recursive: true, force: true });
});

describe("given the real entry point and a spec with no Thai yet", () => {
  it("fails the check, names the missing ids, and exits nonzero", async () => {
    const run = await cli("check", spec, "--format=json");
    const report = JSON.parse(run.out);
    expect(run.code).toBe(1);
    expect(report).toMatchObject({ status: "success", tool: "spec-visual-review" });
    expect(report.result.status).toBe("incomplete");
    expect(report.result.missing).toContain("FR-001");
  });

  it("refuses to render and prints the command that fixes it", async () => {
    const run = await cli("render", spec, "--apply", "--format", "json");
    const report = JSON.parse(run.err);
    expect(run.code).toBe(1);
    expect(report.status).toBe("error");
    expect(report.recovery).toContain("translate");
    expect(fs.existsSync(path.join(reviewDir, "review.html"))).toBe(false);
  });

  it("previews a translation without downloading or writing anything", async () => {
    const run = await cli("translate", spec, "--format=json");
    const report = JSON.parse(run.out);
    expect(run.code).toBe(0);
    expect(report.result.applied).toBe(false);
    expect(report.fingerprint.mode).toBe("preview");
    expect(fs.existsSync(path.join(reviewDir, "thai.json"))).toBe(false);
  });
});

describe("given a complete Thai cache", () => {
  beforeAll(seedThai);

  it("passes the check", async () => {
    const run = await cli("check", spec);
    expect(run.code).toBe(0);
    expect(run.out).toContain("✔ complete");
  });

  it("previews the page, then writes it only with --apply", async () => {
    const preview = await cli("render", spec);
    expect(preview.out).toContain("preview only");
    expect(fs.existsSync(path.join(reviewDir, "review.html"))).toBe(false);
    const applied = await cli("render", spec, "--apply");
    expect(applied.code).toBe(0);
    const html = fs.readFileSync(path.join(reviewDir, "review.html"), "utf8");
    expect(html).toContain("&lt;local&gt; item &amp; more");
    expect(html).toContain(goodThai("Previews MUST NOT mutate local files."));
    expect(html).toContain('<html lang="en" data-theme="graphite"');
  });

  it("accepts value options in both forms and shows a command's help first", async () => {
    const separate = await cli("render", spec, "--out", path.join(work, "a.html"), "--apply");
    const equals = await cli("render", spec, `--out=${path.join(work, "b.html")}`, "--apply");
    expect([separate.code, equals.code]).toEqual([0, 0]);
    expect(fs.existsSync(path.join(work, "a.html"))).toBe(true);
    expect(fs.existsSync(path.join(work, "b.html"))).toBe(true);
    const help = await cli("render", "--help");
    expect(help.code).toBe(0);
    expect(help.out).toContain("--apply");
  });

  it("fails on an unknown option or a missing option value", async () => {
    const unknown = await cli("check", spec, "--nope");
    expect(unknown.code).toBe(2);
    expect(unknown.err).toContain("Unknown option --nope");
    const missing = await cli("render", spec, "--out");
    expect(missing.code).toBe(2);
  });

  it("does not treat --apply as a value for the option before it", async () => {
    const run = await cli("render", spec, "--out", "--apply");
    expect(run.code).toBe(2);
  });

  it("previews setup and reports where the model will live", async () => {
    const run = await cli("setup", "--format=json");
    const report = JSON.parse(run.out);
    expect(run.code).toBe(0);
    expect(report.result.applied).toBe(false);
    expect(report.result.status.modelPath).toContain(path.join(home, ".hf"));
    expect(report.result.steps.length).toBeGreaterThan(0);
  });
});

describe("given a stages.json with an approved spec and a draft plan", () => {
  function writeStages(): string {
    seedThai();
    fs.writeFileSync(
      path.join(work, "plan.md"),
      "# Plan\n\n## Decisions\n\n| ID | Decision |\n| --- | --- |\n| D1 | Keep v2 |\n",
    );
    const file = path.join(work, "stages.json");
    fs.writeFileSync(
      file,
      JSON.stringify({
        title: "T",
        stages: [
          { id: "spec", label: "Spec", kind: "spec", source: "spec.md", approved: "2026-11-01" },
          { id: "plan", label: "Plan", kind: "markdown", source: "plan.md" },
        ],
      }),
    );
    return file;
  }

  it("previews without writing, then writes the page and pins the approved hash", async () => {
    const stages = writeStages();
    const out = path.join(work, "stages.html");
    const preview = await cli("stages", stages, "--out", out);
    expect(preview.code).toBe(0);
    expect(fs.existsSync(out)).toBe(false);
    expect(JSON.parse(fs.readFileSync(stages, "utf8")).stages[0].approvedSha256).toBeUndefined();
    const applied = await cli("stages", stages, "--out", out, "--apply");
    expect(applied.code).toBe(0);
    const page = fs.readFileSync(out, "utf8");
    expect(page).toContain('data-stage="spec"');
    expect(page).toContain('data-stage="plan"');
    expect(page).toContain("Keep v2");
    expect(JSON.parse(fs.readFileSync(stages, "utf8")).stages[0].approvedSha256).toHaveLength(64);
  });

  it("flags both stages after the approved source changes", async () => {
    const stages = writeStages();
    const out = path.join(work, "stages.html");
    await cli("stages", stages, "--out", out, "--apply");
    fs.appendFileSync(spec, "\n<!-- touched -->\n");
    const result = await cli("stages", stages, "--out", out, "--format", "json");
    const states = JSON.parse(result.out).result.stages.map((s: { state: string }) => s.state);
    expect(states).toEqual(["changed", "draft"]);
    await cli("stages", stages, "--out", out, "--apply");
    const page = fs.readFileSync(out, "utf8");
    expect(page).toContain("changed after approval");
    expect(page).toContain("may be out of date");
  });

  it("fails with the path of the first error in a bad blocks file", async () => {
    const stages = writeStages();
    fs.writeFileSync(
      path.join(work, "plan.md.blocks.json"),
      JSON.stringify({ title: "P", sections: [{ title: "S", blocks: [{ type: "video" }] }] }),
    );
    const result = await cli(
      "stages",
      stages,
      "--out",
      path.join(work, "bad.html"),
      "--format",
      "json",
    );
    expect(result.code).toBe(1);
    expect(result.err).toContain("sections.0.blocks.0");
    expect(result.err).toContain("video");
    fs.rmSync(path.join(work, "plan.md.blocks.json"));
  });
});

describe.skipIf(!MODEL_TESTS)(
  "given the real local model (opt-in: SPEC_VISUAL_REVIEW_MODEL=1)",
  () => {
    it("translates a fresh spec with the installed model and keeps every negation", async () => {
      const fresh = fs.mkdtempSync(path.join(os.tmpdir(), "svr-model-"));
      try {
        const freshSpec = path.join(fresh, "spec.md");
        fs.writeFileSync(freshSpec, SPEC);
        const child = Bun.spawn(["bun", CLI, "translate", freshSpec, "--apply", "--format=json"], {
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, HOME: os.homedir() },
        });
        const [out, err, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        expect(err.includes("Traceback")).toBe(false);
        expect(code).toBe(0);
        const result = JSON.parse(out).result;
        expect(result.missing).toEqual([]);
        expect(result.translated).toBeGreaterThan(10);
        const store = JSON.parse(
          fs.readFileSync(path.join(fresh, ".visual-review", "thai.json"), "utf8"),
        );
        const lines = Object.values(store.entries) as Array<{ en: string; th: string }>;
        const mustNot = lines.find((line) => line.en.startsWith("Previews MUST NOT"));
        expect(/[\u0E00-\u0E7F]/.test(mustNot?.th ?? "")).toBe(true);
        expect(/ไม่|ห้าม/.test(mustNot?.th ?? "")).toBe(true);
      } finally {
        fs.rmSync(fresh, { recursive: true, force: true });
      }
    }, 600_000);
  },
);

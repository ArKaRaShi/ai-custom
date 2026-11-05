import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { frameProblems, localLinks, parseFrontmatter, validateSkill } from "@/scripts/validate";

const tempDirs: string[] = [];
const cli = path.join(import.meta.dir, "..", "scripts", "validate.ts");

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** Creates `<tmp>/<name>/` holding the given files and returns its path. */
function makeSkill(name: string, files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "writing-skills-"));
  tempDirs.push(root);
  const dir = path.join(root, name);
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  return dir;
}

const VALID_BODY = "## Steps\n\n1. Do it. Exit: it is done.";

const skillMd = (name: string, description: string, body = VALID_BODY): string =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`;

const errors = (dir: string): string[] =>
  validateSkill(dir)
    .filter((f) => f.level === "error")
    .map((f) => f.message);

describe("given a well-formed skill, when validated, then no findings are reported", () => {
  it("accepts a minimal skill", () => {
    const dir = makeSkill("good-skill", {
      "SKILL.md": skillMd("good-skill", "Extracts data. Use when the user mentions data files."),
    });
    expect(validateSkill(dir)).toEqual([]);
  });

  it("accepts a folded multi-line description", () => {
    const dir = makeSkill("folded-skill", {
      "SKILL.md": `---\nname: folded-skill\ndescription: >\n  Extracts data.\n  Use when asked.\n---\n${VALID_BODY}\n`,
    });
    expect(validateSkill(dir)).toEqual([]);
  });
});

describe("given frontmatter that breaks the naming rules, when validated, then each rule is an error", () => {
  it.each([
    ["Bad_Name", "must use lowercase"],
    ["double--hyphen", "must use lowercase"],
    ["-leading", "must use lowercase"],
    ["claude-helper", "reserved word 'claude'"],
    ["anthropic-tools", "reserved word 'anthropic'"],
  ])("rejects name %s", (name, expected) => {
    const dir = makeSkill(name, { "SKILL.md": skillMd(name, "Does a job. Use when needed.") });
    expect(errors(dir).join("\n")).toContain(expected);
  });

  it("rejects a name that differs from the directory", () => {
    const dir = makeSkill("actual-dir", {
      "SKILL.md": skillMd("other-name", "Does a job. Use when needed."),
    });
    expect(errors(dir)).toContain("name 'other-name' must equal the directory name");
  });

  it("rejects a name over 64 characters", () => {
    const name = "a".repeat(65);
    const dir = makeSkill(name, { "SKILL.md": skillMd(name, "Does a job. Use when needed.") });
    expect(errors(dir)).toContain("name is over 64 characters");
  });
});

describe("given description problems, when validated, then limits are errors and style is a warning", () => {
  it("rejects a description over 1024 characters and XML tags", () => {
    const long = makeSkill("long-desc", { "SKILL.md": skillMd("long-desc", `Use when ${"x".repeat(1020)}`) });
    expect(errors(long)).toContain("description is over 1024 characters");
    const tagged = makeSkill("tag-desc", {
      "SKILL.md": skillMd("tag-desc", "Does a job <b>bold</b>. Use when needed."),
    });
    expect(errors(tagged)).toContain("description contains XML tags");
  });

  it("warns, without failing, on a first-person description with no trigger", () => {
    const dir = makeSkill("soft-desc", { "SKILL.md": skillMd("soft-desc", "I help with files") });
    const findings = validateSkill(dir);
    expect(findings.every((f) => f.level === "warning")).toBe(true);
    expect(findings.map((f) => f.message)).toEqual([
      "description should be third person",
      "description should say when to use the skill",
    ]);
  });

  it("requires frontmatter with name and description", () => {
    expect(errors(makeSkill("no-front", { "SKILL.md": "Just text\n" }))).toEqual([
      "missing or unterminated YAML frontmatter",
    ]);
    expect(errors(makeSkill("bare", { "SKILL.md": "---\nfoo: bar\n---\nBody\n" }))).toEqual([
      "frontmatter is missing `name`",
      "frontmatter is missing `description`",
    ]);
  });
});

describe("given structure problems, when validated, then size, links, and README are errors", () => {
  it("caps the body at 500 lines and accepts exactly 500", () => {
    const ok = makeSkill("at-limit", {
      "SKILL.md": skillMd("at-limit", "Does a job. Use when needed.", "line\n".repeat(500)),
    });
    expect(errors(ok)).toEqual([]);
    const over = makeSkill("over-limit", {
      "SKILL.md": skillMd("over-limit", "Does a job. Use when needed.", "line\n".repeat(501)),
    });
    expect(errors(over)).toEqual(["body is 501 lines; the limit is 500"]);
  });

  it("reports a broken local link but ignores web links, anchors, and code fences", () => {
    const body = "[ok](references/a.md) [gone](references/missing.md) [web](https://x.test) [here](#top)\n```\n[code](nope.md)\n```";
    const dir = makeSkill("links-skill", {
      "SKILL.md": skillMd("links-skill", "Does a job. Use when needed.", body),
      "references/a.md": "# A\n",
    });
    expect(errors(dir)).toEqual(["broken link: references/missing.md"]);
  });

  it("rejects a root README.md", () => {
    const dir = makeSkill("readme-skill", {
      "SKILL.md": skillMd("readme-skill", "Does a job. Use when needed."),
      "README.md": "# hi\n",
    });
    expect(errors(dir)).toEqual(["remove it; SKILL.md is the entry point"]);
  });

  it("warns on a long reference with no contents list and on nested reference links", () => {
    const long = `${"text\n".repeat(120)}`;
    const dir = makeSkill("ref-skill", {
      "SKILL.md": skillMd("ref-skill", "Does a job. Use when needed.", `${VALID_BODY}\n\n[a](references/a.md)`),
      "references/a.md": `# A\n[b](b.md)\n${long}`,
      "references/b.md": "# B\n",
    });
    const messages = validateSkill(dir).map((f) => `${f.level} ${f.file}: ${f.message}`);
    expect(messages).toEqual([
      "warning references/a.md: over 100 lines with no `## Contents` list",
      "warning references/a.md: links to b.md; keep references one level deep from SKILL.md",
    ]);
  });
});

describe("given parsing helpers, when fed edge cases, then they return the documented shape", () => {
  it("parses quoted values and rejects text without frontmatter", () => {
    expect(parseFrontmatter("---\nname: 'x'\n---\nB")?.fields).toEqual({ name: "x" });
    expect(parseFrontmatter("no front")).toBeNull();
    expect(parseFrontmatter("---\nname: x\n")).toBeNull();
  });

  it("returns only relative targets without fragments", () => {
    expect(localLinks("[a](x.md#s) [b](https://e.test/y) [c](#k) [d](mailto:a@b.c)")).toEqual(["x.md"]);
  });
});

describe("given the command line, when run on skills, then the exit code reflects errors", () => {
  const run = (...args: string[]): { code: number | null; out: string } => {
    const r = Bun.spawnSync(["bun", cli, ...args]);
    return { code: r.exitCode, out: r.stdout.toString() };
  };

  it("exits 0 for a good skill, 1 for a bad one, and 2 with no arguments", () => {
    const good = makeSkill("cli-good", { "SKILL.md": skillMd("cli-good", "Does a job. Use when needed.") });
    const bad = makeSkill("cli-bad", { "SKILL.md": skillMd("wrong", "Does a job. Use when needed.") });
    expect(run(good).code).toBe(0);
    const failed = run(good, bad);
    expect(failed.code).toBe(1);
    expect(failed.out).toContain("cli-bad: 1 error(s)");
    expect(run().code).toBe(2);
  });

  it("never modifies the skill it checks", () => {
    const dir = makeSkill("cli-ro", { "SKILL.md": skillMd("cli-wrong", "Does a job. Use when needed.") });
    const before = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8");
    run(dir);
    expect(fs.readFileSync(path.join(dir, "SKILL.md"), "utf8")).toBe(before);
    expect(fs.readdirSync(dir)).toEqual(["SKILL.md"]);
  });
});

describe("given the skill frame, when a body breaks it, then warnings become errors only with --strict", () => {
  it("accepts a steps skill whose every step ends on an Exit condition", () => {
    expect(frameProblems("## Steps\n\n1. First. Exit: a.\n2. Second,\n   continued. Exit: b.\n")).toEqual([]);
  });

  it("names each step that lacks an Exit condition", () => {
    expect(frameProblems("## Steps\n\n1. First. Exit: a.\n2. Second.\n3. Third.\n")).toEqual([
      "step 2 has no `Exit:` condition",
      "step 3 has no `Exit:` condition",
    ]);
  });

  it("accepts a rules skill with The tests and requires it", () => {
    expect(frameProblems("## Rules\n\n- Do x.\n\n## The tests\n\n- Did x?\n")).toEqual([]);
    expect(frameProblems("## Rules\n\n- Do x.\n")).toEqual(["a rules skill needs a `## The tests` section"]);
  });

  it("rejects a body with neither section, with both, or with an empty Steps section", () => {
    expect(frameProblems("## Notes\n\ntext\n")).toEqual(["missing `## Steps` or `## Rules` main section"]);
    expect(frameProblems("## Steps\n\n1. a. Exit: b.\n\n## Rules\n\n- x\n")).toEqual([
      "use either `## Steps` or `## Rules`, not both",
    ]);
    expect(frameProblems("## Steps\n\nprose only\n")).toEqual(["`## Steps` has no numbered steps"]);
  });

  it("ignores headings and numbered lines inside code fences", () => {
    expect(frameProblems("## Steps\n\n1. Run. Exit: ok.\n\n```text\n## Rules\n2. fake\n```\n")).toEqual([]);
  });

  it("reports frame findings as warnings by default and as errors under --strict", () => {
    const dir = makeSkill("frame-skill", {
      "SKILL.md": skillMd("frame-skill", "Does a job. Use when needed.", "## Notes\n\ntext"),
    });
    expect(validateSkill(dir).map((f) => f.level)).toEqual(["warning"]);
    expect(validateSkill(dir, { strict: true }).map((f) => f.level)).toEqual(["error"]);
    const run = (...args: string[]): number | null => Bun.spawnSync(["bun", cli, ...args]).exitCode;
    expect(run(dir)).toBe(0);
    expect(run("--strict", dir)).toBe(1);
  });
});

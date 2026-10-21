#!/usr/bin/env bun
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { runFix } from "../scripts/fix";
import { runReview } from "../scripts/review";
import { checkMarkdownLinks } from "../scripts/link-checker";
import { analyzeTokenDensity } from "../scripts/token-density";
import { checkMarkdownSecurity } from "../scripts/security-check";
import { checkMarkdownStructure } from "../scripts/structure-check";
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from "fs";
import { resolve } from "path";
import { tmpdir } from "os";

describe("given markdown-quality tooling, when executing QA scripts", () => {
  const testFileClean = resolve(tmpdir(), `test-clean-${Date.now()}.md`);
  const testFileDirty = resolve(tmpdir(), `test-dirty-${Date.now()}.md`);
  const testFileLinks = resolve(tmpdir(), `test-links-${Date.now()}.md`);
  const testFileSecurity = resolve(tmpdir(), `test-sec-${Date.now()}.md`);
  const testFileStructure = resolve(tmpdir(), `test-struct-${Date.now()}.md`);

  beforeEach(() => {
    writeFileSync(
      testFileClean,
      `# Clean Title

This is a clean paragraph with proper formatting.

## Section One

Content for section one.

- Item 1
- Item 2

\`\`\`bash
echo "hello"
\`\`\`
`,
    );

    writeFileSync(
      testFileDirty,
      `##BadHeading   

Some text here.   

\`\`\`
unfenced code
\`\`\`
`,
    );

    writeFileSync(
      testFileLinks,
      `# Main Document

## Available Section

Here is content.

[Valid Anchor](#available-section)
[Broken Anchor](#non-existent-section)
[Broken File Link](./missing-sibling-file.md)
[Malformed URL](https://)
`,
    );

    writeFileSync(
      testFileSecurity,
      `# Setup Guide

Run with your key:

\`\`\`bash
export OPENAI_API_KEY="sk-abcdef123456789012345678901234"
export DUMMY_HOST="1.2.3.4"
export TOKEN="<API_KEY>"
\`\`\`
`,
    );

    writeFileSync(
      testFileStructure,
      `# Top Level

## Orphan Heading

### Next Subheading

Some body content.

##### Overly Deep Heading Level 5

And here is unrendered math $\\alpha + \\beta$ in prose.
`,
    );
  });

  afterEach(() => {
    if (existsSync(testFileClean)) unlinkSync(testFileClean);
    if (existsSync(testFileDirty)) unlinkSync(testFileDirty);
    if (existsSync(testFileLinks)) unlinkSync(testFileLinks);
    if (existsSync(testFileSecurity)) unlinkSync(testFileSecurity);
    if (existsSync(testFileStructure)) unlinkSync(testFileStructure);
  });

  it("runFix returns clean or auto-fixed status on well-formatted markdown file", async () => {
    const result = await runFix({ target: testFileClean });
    expect(result.exitCode).toBe(0);
    expect(["clean", "auto-fixed"]).toContain(result.status);
    expect(result.remainingCount).toBe(0);
  });

  it("runFix attempts fixes on dirty markdown file and returns result object", async () => {
    const result = await runFix({ target: testFileDirty });
    expect(result).toBeDefined();
    expect(typeof result.exitCode).toBe("number");
    expect(typeof result.fixCount).toBe("number");
  });

  it("checkMarkdownLinks accurately detects broken local files, missing anchors, and bad URLs", () => {
    const linkReport = checkMarkdownLinks(testFileLinks);
    expect(linkReport.totalLinks).toBe(4);
    expect(linkReport.brokenLinks.length).toBe(3);

    const reasons = linkReport.brokenLinks.map((b) => b.reason);
    expect(reasons.some((r) => r.includes("non-existent-section"))).toBe(true);
    expect(reasons.some((r) => r.includes("missing-sibling-file.md"))).toBe(true);
    expect(reasons.some((r) => r.includes("Malformed external URL"))).toBe(true);
  });

  it("analyzeTokenDensity calculates tokens and detects filler and condescending words", () => {
    const doc = `
# Verbose Intro
It is worth noting that we should check this.
In order to test the pipeline, let's dive in.
Simply copy the code and just run it, obviously.
`;
    const report = analyzeTokenDensity(doc);
    expect(report.wordCount).toBeGreaterThan(5);
    expect(report.estimatedTokens).toBeGreaterThan(0);
    expect(report.fillerMatches.length).toBe(3);
    expect(report.condescendingMatches.length).toBe(3);
  });

  it("checkMarkdownSecurity flags leaked secrets, dummy IPs, and placeholder tokens", () => {
    const content = `
export API_KEY="sk-123456789012345678901234567890"
export HOST="1.2.3.4"
export TOKEN="<AUTH_TOKEN>"
`;
    const secResult = checkMarkdownSecurity(content);
    expect(secResult.totalFindings).toBe(3);
    const types = secResult.findings.map((f) => f.type);
    expect(types).toContain("leaked-secret");
    expect(types).toContain("dummy-ip");
    expect(types).toContain("placeholder-token");
  });

  it("checkMarkdownStructure flags deep headings (H5/H6), orphan headings, and unrendered LaTeX", () => {
    const content = `
## Orphan Heading

### Subheading

Body paragraph.

##### Level 5 Heading

Formula with $\\alpha$ inline.
`;
    const structResult = checkMarkdownStructure(content);
    expect(structResult.totalFindings).toBe(3);
    const types = structResult.findings.map((f) => f.type);
    expect(types).toContain("orphan-heading");
    expect(types).toContain("deep-heading");
    expect(types).toContain("unrendered-latex");
  });

  it("does not treat line-number indexes as Markdown structure errors", () => {
    const content = `# Title

> **Index:**
> | Section | Lines | Anchor |
> | :--- | :--- | :--- |
> | First Section | L20–L30 | [#first-section](#first-section) |
> | Nonexistent Section | L31–L40 | [#nonexistent](#nonexistent) |

## First Section

Body text.
`;

    const result = checkMarkdownStructure(content);
    expect(result.findings.map((finding) => finding.type)).not.toContain("index-line-drift");
    expect(result.findings.map((finding) => finding.type)).not.toContain("index-missing-heading");
  });
  it("runReview performs comprehensive multi-phase review cleanly", async () => {
    const result = await runReview({ glob: testFileClean });
    expect(result).toBeDefined();
    expect(typeof result.lintErrors).toBe("number");
    expect(typeof result.valeErrors).toBe("number");
    expect(typeof result.brokenLinksCount).toBe("number");
    expect(typeof result.securityIssuesCount).toBe("number");
    expect(typeof result.structureIssuesCount).toBe("number");
    expect(result.densityReports.length).toBeGreaterThan(0);
    expect(["CLEAN", "NEEDS_REVIEW"]).toContain(result.verdict);
  });

  it("runReview supports --mode=ai and --mode=human with explicit config overrides", () => {
    const scriptPath = resolve(import.meta.dir, "../scripts/review.ts");
    const isolatedCwd = resolve(tmpdir(), `mq-mode-isolated-${Date.now()}`);
    mkdirSync(isolatedCwd, { recursive: true });
    const sampleFile = resolve(isolatedCwd, "sample.md");
    writeFileSync(sampleFile, "# Sample\n\nPlain content.\n");

    try {
      // Default AI mode uses bundled/ai
      const aiProc = Bun.spawnSync(["bun", scriptPath, sampleFile]);
      expect(aiProc.stdout.toString()).toContain("mode: ai");
      expect(aiProc.stdout.toString()).toContain("lint → bundled/ai");
      expect(aiProc.stdout.toString()).toContain("vale → bundled/ai");

      // Human mode uses bundled/human
      const humanProc = Bun.spawnSync(["bun", scriptPath, sampleFile, "--mode=human"]);
      expect(humanProc.stdout.toString()).toContain("mode: human");
      expect(humanProc.stdout.toString()).toContain("lint → bundled/human");
      expect(humanProc.stdout.toString()).toContain("vale → bundled/human");

      // Custom config override via --config
      const customIni = resolve(isolatedCwd, "custom.ini");
      writeFileSync(customIni, "StylesPath = .vale/styles\n[*.md]\nBasedOnStyles = Vale\n");
      const customProc = Bun.spawnSync(["bun", scriptPath, sampleFile, `--vale-config=${customIni}`]);
      expect(customProc.stdout.toString()).toContain("vale → custom");
    } finally {
      rmSync(isolatedCwd, { recursive: true, force: true });
    }
  });
  it("runReview supports reviewing direct string content via --text without files", () => {
    const scriptPath = resolve(import.meta.dir, "../scripts/review.ts");
    const cleanText = "# Title\n\nClean markdown content for testing.\n";
    const res = Bun.spawnSync(["bun", scriptPath, `--text=${cleanText}`, "--format=json"]);
    expect(res.exitCode).toBe(0);

    const parsed = JSON.parse(res.stdout.toString());
    expect(parsed.tool).toBe("markdown-quality");
    expect(parsed.command).toBe("review");
    expect(parsed.status).toBe("clean");
    expect(parsed.fingerprint.files).toContain("<string>");
  });

  it("runReview with --text ignores sibling markdown files in current working directory", () => {
    const scriptPath = resolve(import.meta.dir, "../scripts/review.ts");
    const isolatedCwd = resolve(tmpdir(), `test-text-isolation-${Date.now()}`);
    mkdirSync(isolatedCwd, { recursive: true });
    try {
      // Sibling file with intentional lint error (bare URL violating MD034 in human mode)
      writeFileSync(resolve(isolatedCwd, "sibling-dirty.md"), "# Dirty\n\nhttps://example.com/bare-url\n");
      const cleanText = "## Summary\n\nAdd equipment-level filtering.\n";
      const res = Bun.spawnSync(["bun", scriptPath, `--text=${cleanText}`, "--mode=human", "--format=json"], {
        cwd: isolatedCwd,
      });
      expect(res.exitCode).toBe(0);
      const parsed = JSON.parse(res.stdout.toString());
      expect(parsed.status).toBe("clean");
      expect(parsed.summary.lintErrors).toBe(0);
      expect(parsed.summary.totalErrors).toBe(0);
    } finally {
      rmSync(isolatedCwd, { recursive: true, force: true });
    }
  });

  it("bundled vocabulary applies when a user-level Vale vocabulary has the same name", () => {
    const scriptPath = resolve(import.meta.dir, "../scripts/review.ts");
    const home = resolve(tmpdir(), `test-vale-home-${Date.now()}`);
    // Vale reads user config from the macOS and XDG locations; create both so the test is platform independent.
    const userDirs = [resolve(home, "Library/Application Support/vale"), resolve(home, ".config/vale")];
    try {
      for (const dir of userDirs) {
        mkdirSync(resolve(dir, ".vale/styles/config/vocabularies/Personal"), { recursive: true });
        writeFileSync(resolve(dir, ".vale/styles/config/vocabularies/Personal/accept.txt"), "unrelated\n");
        writeFileSync(resolve(dir, ".vale.ini"), "StylesPath = .vale/styles\nVocab = Personal\n");
      }
      const res = Bun.spawnSync(["bun", scriptPath, "--text=# Title\n\nThe venv appears.\n", "--mode=ai", "--format=json"], {
        env: { ...process.env, HOME: home, XDG_CONFIG_HOME: resolve(home, ".config") },
      });
      const parsed = JSON.parse(res.stdout.toString());
      expect(parsed.summary.valeErrors).toBe(0);
      expect(res.exitCode).toBe(0);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  describe("given more findings than the tree prints by default", () => {
    const scriptPath = resolve(import.meta.dir, "../scripts/review.ts");
    const words = Array.from({ length: 20 }, (_, i) => `zzqa${String.fromCharCode(97 + i)}x`);
    const text = `# Title\n\n${words.join(" ")}\n`;
    const run = (...flags: string[]) => Bun.spawnSync(["bun", scriptPath, `--text=${text}`, "--mode=ai", ...flags]);

    it("prints a capped tree by default and points to the full list", () => {
      const out = run().stdout.toString();
      expect(out).toMatch(/\.\.\. and \d+ more/);
      expect(out).toContain("--verbose");
      expect(out).not.toContain(`'${words[19]}'`);
    });

    it("prints every finding with --verbose", () => {
      const out = run("--verbose").stdout.toString();
      expect(out).not.toContain("more");
      for (const word of words) expect(out).toContain(`'${word}'`);
    });

    it("rejects the removed --all flag", () => {
      const res = run("--all");
      expect(res.exitCode).not.toBe(0);
      expect(res.stderr.toString()).toContain("--all");
    });

    it("lists every finding in --format=json next to the counts", () => {
      const parsed = JSON.parse(run("--format=json").stdout.toString());
      expect(parsed.findings.prose).toHaveLength(parsed.summary.valeErrors);
      expect(parsed.findings.prose.length).toBeGreaterThanOrEqual(20);
      for (const word of words) expect(parsed.findings.prose.join("\n")).toContain(`'${word}'`);
      expect(parsed.findings.lint).toEqual([]);
    });
  });

  it("names the kind and reason of structure and security findings instead of undefined", () => {
    const scriptPath = resolve(import.meta.dir, "../scripts/review.ts");
    const text = '# Title\n\n##### Level 5 Heading\n\nBody.\n\nexport HOST="1.2.3.4"\n';
    const res = Bun.spawnSync(["bun", scriptPath, `--text=${text}`, "--mode=ai", "--format=json"]);
    const parsed = JSON.parse(res.stdout.toString());
    expect(parsed.findings.structure.join("\n")).toContain("deep-heading");
    expect(parsed.findings.security.join("\n")).toContain("dummy-ip");
    for (const line of [...parsed.findings.structure, ...parsed.findings.security]) {
      expect(line).not.toContain("undefined");
    }
  });

  describe("given a document with only style warnings", () => {
    const scriptPath = resolve(import.meta.dir, "../scripts/review.ts");
    const text = "# Title\n\nA plain sentence has a colon: Use it; the tests pass.\n";
    const run = (...flags: string[]) => Bun.spawnSync(["bun", scriptPath, `--text=${text}`, "--mode=ai", ...flags]);

    it("passes with exit 0 and lists the warnings in json without counting them as errors", () => {
      const res = run("--format=json");
      const parsed = JSON.parse(res.stdout.toString());
      expect(res.exitCode).toBe(0);
      expect(parsed.status).toBe("clean");
      expect(parsed.summary.valeErrors).toBe(0);
      expect(parsed.summary.valeWarnings).toBeGreaterThanOrEqual(2);
      const warnings = parsed.findings.warnings.join("\n");
      expect(warnings).toContain("ai-tells.ColonUsage");
      expect(warnings).toContain("ai-tells.SemicolonUsage");
      expect(parsed.findings.prose).toEqual([]);
    });

    it("prints the warnings in the tree and reports a clean result that counts them", () => {
      const res = run();
      const out = res.stdout.toString();
      expect(res.exitCode).toBe(0);
      expect(out).toContain("ai-tells.ColonUsage");
      expect(out).toMatch(/Result: CLEAN \(\d+ warning\(s\)\)/);
    });

    it("still fails with exit 1 when an error-level finding is present next to warnings", () => {
      const res = Bun.spawnSync(["bun", scriptPath, `--text=${text}\nThe zzqxword appears.\n`, "--mode=ai", "--format=json"]);
      const parsed = JSON.parse(res.stdout.toString());
      expect(res.exitCode).toBe(1);
      expect(parsed.summary.valeErrors).toBe(1);
      expect(parsed.findings.prose.join("\n")).toContain("zzqxword");
      expect(parsed.findings.warnings.join("\n")).toContain("ai-tells.ColonUsage");
    });
  });

  it("treats ColonUsage as a warning that does not cause exit 1", () => {
    const scriptPath = resolve(import.meta.dir, "../scripts/review.ts");
    const text = "# Title\n\n**Goal:** Rebuild the tool.\n";
    const res = Bun.spawnSync(["bun", scriptPath, `--text=${text}`, "--mode=ai", "--format=json"]);
    expect(res.exitCode).toBe(0);
    const parsed = JSON.parse(res.stdout.toString());
    expect(parsed.status).toBe("clean");
    expect(parsed.summary.valeErrors).toBe(0);
    expect(parsed.summary.valeWarnings).toBeGreaterThanOrEqual(1);
    const colon = (parsed.findings.warnings as string[]).filter((w) => w.includes("ColonUsage"));
    expect(colon.length).toBeGreaterThanOrEqual(1);
  });


  it("all scripts support --help and -h flags", () => {
    const scripts = [
      "review.ts",
      "fix.ts",
      "link-checker.ts",
      "security-check.ts",
      "structure-check.ts",
      "token-density.ts",
    ];

    for (const script of scripts) {
      const scriptPath = resolve(import.meta.dir, "../scripts", script);

      const helpProc = Bun.spawnSync(["bun", scriptPath, "--help"]);
      expect(helpProc.exitCode).toBe(0);
      expect(helpProc.stdout.toString()).toContain("Usage:");

      const shortHelpProc = Bun.spawnSync(["bun", scriptPath, "-h"]);
      expect(shortHelpProc.exitCode).toBe(0);
      expect(shortHelpProc.stdout.toString()).toContain("Usage:");
    }
  });

  it("review.ts and fix.ts reject unknown CLI flags", () => {
    const reviewScript = resolve(import.meta.dir, "../scripts/review.ts");
    const fixScript = resolve(import.meta.dir, "../scripts/fix.ts");

    const resReview = Bun.spawnSync(["bun", reviewScript, "--unknown-flag"]);
    expect(resReview.exitCode).not.toBe(0);
    expect(resReview.stderr.toString()).toContain("Unknown flag");

    const resFix = Bun.spawnSync(["bun", fixScript, "--unknown-flag"]);
    expect(resFix.exitCode).not.toBe(0);
    expect(resFix.stderr.toString()).toContain("Unknown flag");
  });

  it("review.ts validates --min-level syntax per skill-framework contract", () => {
    const reviewScript = resolve(import.meta.dir, "../scripts/review.ts");

    // Missing value
    const missingVal = Bun.spawnSync(["bun", reviewScript, "--min-level"]);
    expect(missingVal.exitCode).not.toBe(0);
    expect(missingVal.stderr.toString()).toContain("--min-level requires a value");

    // Flag-like token as value
    const flagVal = Bun.spawnSync(["bun", reviewScript, "--min-level", "-x"]);
    expect(flagVal.exitCode).not.toBe(0);
    expect(flagVal.stderr.toString()).toContain("--min-level requires a value");

    // Valid separate form
    const sepForm = Bun.spawnSync(["bun", reviewScript, "--min-level", "error", testFileClean]);
    expect(sepForm.exitCode).toBe(0);

    // Valid equals form
    const eqForm = Bun.spawnSync(["bun", reviewScript, "--min-level=error", testFileClean]);
    expect(eqForm.exitCode).toBe(0);
  });

  it("--text saves inline content and prints reuse and cleanup instructions", () => {
    const reviewScript = resolve(import.meta.dir, "../scripts/review.ts");
    const text = "# Reusable input\n\nContent.\n";
    const result = Bun.spawnSync(["bun", reviewScript, `--text=${text}`, "--no-links", "--no-security", "--no-density", "--no-structure"]);
    const output = result.stdout.toString() + result.stderr.toString();
    const artifact = output.match(/Saved text artifact: (.+)/)?.[1]?.trim();
    expect(result.exitCode).toBe(0);
    expect(artifact).toBeDefined();
    expect(existsSync(artifact!)).toBe(true);
    expect(readFileSync(artifact!, "utf8")).toBe(text);
    expect(output).toContain(`bun "${resolve(import.meta.dir, "../scripts/cleanup.ts")}" "${artifact}"`);
    expect(output).toContain("Delete it with --apply when ready.");
    rmSync(artifact!);
  });

  it("rejects --text-file in favor of normal file targets", () => {
    const reviewScript = resolve(import.meta.dir, "../scripts/review.ts");
    const result = Bun.spawnSync(["bun", reviewScript, "--text-file=./draft.md"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("Unknown flag: --text-file=./draft.md");
  });

  it("cleanup defaults to dry-run and deletes only with --apply", () => {
    const cleanupScript = resolve(import.meta.dir, "../scripts/cleanup.ts");
    const artifactDir = resolve(import.meta.dir, "../.tmp-markdown-quality");
    mkdirSync(artifactDir, { recursive: true });
    const artifact = resolve(artifactDir, `markdown-artifact-${Date.now()}.md`);
    writeFileSync(artifact, "# Keep until apply\n");
    const dryRun = Bun.spawnSync(["bun", cleanupScript, artifact]);
    expect(dryRun.exitCode).toBe(0);
    expect(existsSync(artifact)).toBe(true);
    expect(dryRun.stdout.toString()).toContain("Dry run");

    const applied = Bun.spawnSync(["bun", cleanupScript, artifact, "--apply"]);
    expect(applied.exitCode).toBe(0);
    expect(existsSync(artifact)).toBe(false);
  });

  it("resolves directory targets recursively and ignores non-markdown files", async () => {
    const testDir = resolve(tmpdir(), `test-dir-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const subDir = resolve(testDir, "nested");
    mkdirSync(subDir, { recursive: true });

    const md1 = resolve(testDir, "doc1.md");
    const md2 = resolve(subDir, "doc2.markdown");
    const nonMd = resolve(testDir, "script.ts");
    const json = resolve(subDir, "data.json");

    writeFileSync(md1, "# Doc 1\n\nContent here.\n");
    writeFileSync(md2, "# Doc 2\n\nContent here.\n");
    writeFileSync(nonMd, "console.log('not markdown');");
    writeFileSync(json, "{}");

    try {
      const resolverScript = resolve(import.meta.dir, "../scripts/target-resolver.ts");
      const { resolveMarkdownFiles } = await import(resolverScript);

      const matched = resolveMarkdownFiles(testDir);
      expect(matched.length).toBe(2);
      expect(matched).toContain(md1);
      expect(matched).toContain(md2);
      expect(matched).not.toContain(nonMd);
      expect(matched).not.toContain(json);

      // Review script accepts the directory and processes the markdown files
      const reviewScript = resolve(import.meta.dir, "../scripts/review.ts");
      const reviewProc = Bun.spawnSync(["bun", reviewScript, testDir, nonMd]);
      expect(reviewProc.stdout.toString()).toContain("2 files");
      expect(reviewProc.stdout.toString()).toContain("├─ standards");
      expect(reviewProc.stdout.toString()).toContain("Result: CLEAN");
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});

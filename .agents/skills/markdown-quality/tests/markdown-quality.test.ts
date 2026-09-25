#!/usr/bin/env bun
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { runFix } from "../scripts/fix";
import { runReview } from "../scripts/review";
import { checkMarkdownLinks } from "../scripts/link-checker";
import { analyzeTokenDensity } from "../scripts/token-density";
import { checkMarkdownSecurity } from "../scripts/security-check";
import { checkMarkdownStructure } from "../scripts/structure-check";
import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from "fs";
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

#!/usr/bin/env bun
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { runFix } from "../scripts/fix";
import { runReview } from "../scripts/review";
import { checkMarkdownLinks } from "../scripts/link-checker";
import { analyzeTokenDensity } from "../scripts/token-density";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { resolve } from "path";
import { tmpdir } from "os";

describe("given markdown-quality tooling, when executing QA scripts", () => {
  const testFileClean = resolve(tmpdir(), `test-clean-${Date.now()}.md`);
  const testFileDirty = resolve(tmpdir(), `test-dirty-${Date.now()}.md`);
  const testFileLinks = resolve(tmpdir(), `test-links-${Date.now()}.md`);

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
  });

  afterEach(() => {
    if (existsSync(testFileClean)) unlinkSync(testFileClean);
    if (existsSync(testFileDirty)) unlinkSync(testFileDirty);
    if (existsSync(testFileLinks)) unlinkSync(testFileLinks);
  });

  it("runFix returns clean status on well-formatted markdown file", async () => {
    const result = await runFix({ target: testFileClean });
    expect(result.exitCode).toBe(0);
    expect(result.status).toBe("clean");
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

  it("analyzeTokenDensity calculates tokens, detects filler phrases, and rates density", () => {
    const fillerDoc = `
# Verbose Intro
It is worth noting that we should check this.
In order to test the pipeline, let's dive in.
`;
    const report = analyzeTokenDensity(fillerDoc);
    expect(report.wordCount).toBeGreaterThan(5);
    expect(report.estimatedTokens).toBeGreaterThan(0);
    expect(report.fillerMatches.length).toBe(3);
    expect(report.fillerMatches.map((m) => m.phrase.toLowerCase())).toContain("it is worth noting that");
  });

  it("runReview performs multi-phase review including link integrity and token density", async () => {
    const result = await runReview({ glob: testFileClean });
    expect(result).toBeDefined();
    expect(typeof result.lintErrors).toBe("number");
    expect(typeof result.valeErrors).toBe("number");
    expect(typeof result.brokenLinksCount).toBe("number");
    expect(result.densityReports.length).toBeGreaterThan(0);
    expect(["CLEAN", "NEEDS_REVIEW"]).toContain(result.verdict);
  });
});

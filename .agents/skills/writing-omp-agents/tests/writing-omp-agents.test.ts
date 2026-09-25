import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("given OMP task-agent specification, when validating instructions, then enforces contract structure and quality review", () => {
  const skillPath = join(import.meta.dir, "../SKILL.md");

  it("exists and has valid YAML frontmatter with name and description", () => {
    expect(existsSync(skillPath)).toBe(true);
    const content = readFileSync(skillPath, "utf-8");
    expect(content).toMatch(/^---\nname:\s*writing-omp-agents\n/);
    expect(content).toContain("description:");
  });

  it("mandates the four-tier instruction body structure", () => {
    const content = readFileSync(skillPath, "utf-8");
    expect(content).toContain("1. **Scope:**");
    expect(content).toContain("2. **Process:**");
    expect(content).toContain("3. **Verification:**");
    expect(content).toContain("4. **Completion:**");
  });

  it("mandates markdown-quality review with non-blocking fallback", () => {
    const content = readFileSync(skillPath, "utf-8");
    expect(content).toContain("**REQUIRE SUBSKILL:** `markdown-quality`");
    expect(content).toContain("without stalling");
  });
});

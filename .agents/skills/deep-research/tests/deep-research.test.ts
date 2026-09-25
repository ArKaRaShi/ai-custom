import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const SKILL_PATH = path.join(
  process.env.HOME || "",
  ".agents/skills/deep-research/SKILL.md"
);

describe("given deep-research skill specification, when validating contracts and invariants, then enforces evidence-anchored investigation and strict source provenance", () => {
  it("exists and has valid YAML frontmatter adhering to SDO standards", () => {
    expect(fs.existsSync(SKILL_PATH)).toBe(true);
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/^---\nname:\s*deep-research\n/);
    expect(content).toMatch(/description:\s*Use when/);
    
    // Frontmatter description should be under 500 characters and avoid first person
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    expect(frontmatterMatch).not.toBeNull();
    const descMatch = frontmatterMatch![1].match(/description:\s*(.+)/);
    expect(descMatch).not.toBeNull();
    expect(descMatch![1].length).toBeLessThan(500);
    expect(descMatch![1]).not.toMatch(/\b(I|we|my|our)\b/i);
  });

  it("enforces tool routing for Context7 and web search with local repo grounding", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/Context7/i);
    expect(content).toMatch(/web_search|web search/i);
    expect(content).toMatch(/repo|lockfile|dependencies/i);
  });

  it("mandates explicit source provenance tags for every factual finding", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/Source Provenance|Source Attribution/i);
    expect(content).toContain("[Source: Context7");
    expect(content).toContain("[Source: WebSearch");
    expect(content).toContain("[Source: Repo");
  });

  it("defines structured technical research output recipe and excludes conversational debate/discussion", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    // Structured research recipe
    expect(content).toMatch(/Objective|Scope/i);
    expect(content).toMatch(/Findings|Verified Findings/i);
    expect(content).toMatch(/Code|Snippet|Usage/i);
    expect(content).toMatch(/Constraints|Caveats|Breaking/i);
    
    // Explicitly excludes discussion-oriented debate recipes
    expect(content).not.toMatch(/Empirical Trade-off Matrix/i);
    expect(content).not.toMatch(/Discussion Mode/i);
  });

  it("includes rationalization table and red flags list for investigative discipline", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/Rationalization Table/i);
    expect(content).toMatch(/Red Flags/i);
  });
});

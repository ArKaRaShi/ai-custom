import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const SKILL_PATH = path.join(
  process.env.HOME || "",
  ".agents/skills/grounded-discussion/SKILL.md"
);

describe("given grounded-discussion skill specification, when validating contracts and invariants, then enforces evidence-anchored analysis and provenance tags", () => {
  it("exists and has valid YAML frontmatter with name and description", () => {
    expect(fs.existsSync(SKILL_PATH)).toBe(true);
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/^---\nname:\s*grounded-discussion\n/);
    expect(content).toMatch(/description:\s*Use when/);
  });

  it("enforces inspection before opinion", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/inspect\s+before\s+opin(e|ing)|read\s+before\s+advising/i);
    expect(content).toMatch(/repo\s+(anchor|fact|grounding)/i);
  });

  it("mandates explicit source provenance tags for every claim", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/Source Provenance|Source Attribution/i);
    expect(content).toContain("[Source: Repo");
    expect(content).toContain("[Source: Context7");
    expect(content).toContain("[Source: WebSearch");
  });

  it("defines the 4-part positive output recipe", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/Repo Reality|Internal Anchor/i);
    expect(content).toMatch(/Verified Documentation|External Anchor/i);
    expect(content).toMatch(/Trade-off Matrix|Tradeoff/i);
    expect(content).toMatch(/Recommendation|Decision/i);
  });

  it("prohibits unanchored speculation and bans vague filler language", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/Anti-Speculation|Banned Language/i);
  });

  it("includes rationalization table and red flags list", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/Rationalization Table/i);
    expect(content).toMatch(/Red Flags/i);
  });
});

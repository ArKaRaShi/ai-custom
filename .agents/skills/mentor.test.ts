import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const SKILL_PATH = path.join(
  process.env.HOME || "",
  ".agents/skills/mentor/SKILL.md",
);

describe("given mentor skill specification, when validating contracts and invariants, then complies with zero-assumption teaching guidelines", () => {
  it("exists and has valid YAML frontmatter with name and description", () => {
    expect(fs.existsSync(SKILL_PATH)).toBe(true);
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/^---\nname:\s*mentor\n/);
    expect(content).toContain("description:");
  });

  it("strictly prohibits implementation, editing, and code generation", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/zero[\s-]implementation/i);
    expect(content).toMatch(/no\s+code\s+edits|read-only/i);
  });

  it("enforces zero-assumption baseline with domain vocabulary translation", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/assume\s+zero\s+prior\s+knowledge|know\s+nothing/i);
    expect(content).toMatch(/analogy|everyday\s+thing/i);
    expect(content).toMatch(/vocabulary|jargon\s+translation/i);
  });

  it("requires concrete code/data flow tracing and interactive checkpoint pacing", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/trace|flow/i);
    expect(content).toMatch(/checkpoint|question/i);
  });

  it("enforces active research via context7/web_search with official references and citations", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/context7|documentation|web_search/i);
    expect(content).toMatch(/reference|citation|link/i);
  });

  it("mandates intellectual honesty: do not blind trust sources, state uncertainty explicitly", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/never\s+blindly\s+trust|do\s+not\s+blind\s+trust/i);
    expect(content).toMatch(/uncertain|state\s+uncertainty|if\s+unsure/i);
  });
});

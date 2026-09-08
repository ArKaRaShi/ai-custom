import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const SKILL_PATH = path.join(
  process.env.HOME || "",
  ".agents/skills/obsidian-distill/SKILL.md"
);

describe("given obsidian-distill skill specification, when validating contracts and invariants, then complies with distillation and vault standards", () => {
  it("exists and has valid YAML frontmatter with name and description", () => {
    expect(fs.existsSync(SKILL_PATH)).toBe(true);
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/^---\nname:\s*obsidian-distill\n/);
    expect(content).toMatch(/description:\s*Use when/);
  });

  it("enforces 'Refactor, Don't Copy' and forbids raw transcript dumping", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/Refactor,\s*Don't Copy/i);
    expect(content).toMatch(/Golden Path/i);
  });

  it("enforces vault discovery protocol without hardcoded folder assumptions", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/Vault Discovery Protocol/i);
    expect(content).toMatch(/Existing Folder Ontology/i);
    expect(content).toMatch(/Discover Reusable Templates/i);
  });

  it("classifies knowledge into semantic archetypes", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/Procedure/);
    expect(content).toMatch(/System Map/);
    expect(content).toMatch(/Diagnosis/);
    expect(content).toMatch(/Recipe/);
    expect(content).toMatch(/Transient/);
  });

  it("mandates proposal table gate and supports path redirection", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/Proposal Gate/i);
    expect(content).toMatch(/Never write notes without presenting the proposal table first/i);
    expect(content).toMatch(/redirect paths/i);
  });

  it("strictly prohibits plaintext secrets and enforces dynamic retrieval", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/NEVER write plaintext passwords/i);
    expect(content).toMatch(/jsonpath=.*base64 --decode;\s*echo/);
  });

  it("enforces markdown-quality verification on generated notes", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/markdown-quality/);
    expect(content).toMatch(/CLEAN/);
  });
});

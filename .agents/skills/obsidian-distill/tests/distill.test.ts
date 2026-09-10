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

  it("enforces generic vault discovery protocol without hardcoded path assumptions", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/references\/vault-discovery\.md/i);
    expect(content).not.toMatch(/default to ~\//i);
    const vaultRef = path.join(path.dirname(SKILL_PATH), "references/vault-discovery.md");
    expect(fs.existsSync(vaultRef)).toBe(true);
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

  it("requires a topic hub before deep-dive notes", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/Topic Hub|MOC|Map of Content/i);
    expect(content).toMatch(/context node|middle node/i);
    expect(content).toMatch(/deep-dive/i);
  });

  it("requires graph hierarchy through wikilinks while keeping folders shallow", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/topic.*hub.*before.*deep/i);
    expect(content).toMatch(/wikilinks/i);
    expect(content).toMatch(/shallow/i);
    expect(content).toMatch(/parent.*link|link.*parent/i);
  });

  it("requires parent-first creation and grouped proposal paths", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/create.*hub.*first|hub.*first.*create/i);
    expect(content).toMatch(/group.*topic/i);
    expect(content).toMatch(/child.*note|deep.*note/i);
  });

  it("adheres to token efficiency (SKILL.md word count < 500 words)", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    const words = content.trim().split(/\s+/).length;
    expect(words).toBeLessThan(500);
  });
});

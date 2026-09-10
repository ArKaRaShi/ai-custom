import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const SKILL_DIR = path.join(
  process.env.HOME || "",
  ".agents/skills/obsidian-consult"
);
const SKILL_PATH = path.join(SKILL_DIR, "SKILL.md");
const VAULT_DISCOVERY_REF = path.join(SKILL_DIR, "references/vault-discovery.md");
const GRAPH_TRAVERSAL_REF = path.join(SKILL_DIR, "references/graph-traversal.md");

describe("given obsidian-consult skill specification, when validating contracts and invariants, then complies with retrieval and vault standards", () => {
  it("exists and has valid YAML frontmatter adhering to SDO standards", () => {
    expect(fs.existsSync(SKILL_PATH)).toBe(true);
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/^---\nname:\s*obsidian-consult\n/);
    expect(content).toMatch(/description:\s*Use when/);

    const descMatch = content.match(/description:\s*(.+)/);
    expect(descMatch).not.toBeNull();
    const desc = descMatch![1];
    expect(desc.length).toBeLessThan(1024);
    // SDO rule: do not summarize workflow in description
    expect(desc).not.toMatch(/step 1|first,|then\s+/i);
  });

  it("enforces generic vault discovery without hardcoded path assumptions", () => {
    expect(fs.existsSync(SKILL_PATH)).toBe(true);
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).not.toMatch(/default to ~\//i);
    expect(content).toMatch(/vault-discovery/i);
    expect(fs.existsSync(VAULT_DISCOVERY_REF)).toBe(true);
  });

  it("references graph traversal reference for deep extraction rules", () => {
    expect(fs.existsSync(GRAPH_TRAVERSAL_REF)).toBe(true);
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/graph-traversal/i);
  });

  it("enforces strictly read-only invariants and forbids note mutation", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/read-only/i);
    expect(content).toMatch(/zero (file )?(writes|mutations|edits)/i);
  });

  it("forbids hardcoded plain secrets and requires dynamic retrieval", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/secret/i);
    expect(content).toMatch(/never (echo|write|store) plain/i);
  });

  it("requires citing vault source notes upon answering", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/cite/i);
  });

  it("adheres to token efficiency (SKILL.md word count < 500 words)", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    const words = content.trim().split(/\s+/).length;
    expect(words).toBeLessThan(500);
  });
});

import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const ROOT_PATH = path.join(
  process.env.HOME || "",
  ".agents/skills/deep-research"
);
const SKILL_PATH = path.join(ROOT_PATH, "SKILL.md");
const CITATION_REF_PATH = path.join(ROOT_PATH, "references/citation-style.md");
const ROUTING_REF_PATH = path.join(ROOT_PATH, "references/routing-strategy.md");

describe("given deep-research skill specification, when validating modular layout and contracts, then enforces clean layout, tool routing, and natural citation provenance", () => {
  it("exists and has valid YAML frontmatter adhering to SDO standards", () => {
    expect(fs.existsSync(SKILL_PATH)).toBe(true);
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/^---\nname:\s*deep-research\n/);
    expect(content).toMatch(/description:\s*Use when/);

    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    expect(frontmatterMatch).not.toBeNull();
    const descMatch = frontmatterMatch![1].match(/description:\s*(.+)/);
    expect(descMatch).not.toBeNull();
    expect(descMatch![1].length).toBeLessThan(500);
    expect(descMatch![1]).not.toMatch(/\b(I|we|my|our)\b/i);
  });

  it("conforms to skill-layout with references subdirectories and pointers", () => {
    expect(fs.existsSync(CITATION_REF_PATH)).toBe(true);
    expect(fs.existsSync(ROUTING_REF_PATH)).toBe(true);

    const skillContent = fs.readFileSync(SKILL_PATH, "utf8");
    expect(skillContent).toContain("references/citation-style.md");
    expect(skillContent).toContain("references/routing-strategy.md");
  });

  it("routes tools for Context7 and web search with local repo grounding", () => {
    const routingContent = fs.readFileSync(ROUTING_REF_PATH, "utf8");
    expect(routingContent).toMatch(/Context7/i);
    expect(routingContent).toMatch(/web_search|web search/i);
    expect(routingContent).toMatch(/lockfile|package\.json/i);
  });

  it("mandates natural markdown links and placement rules in citation-style reference", () => {
    const citationContent = fs.readFileSync(CITATION_REF_PATH, "utf8");
    expect(citationContent).toMatch(/context badges|Natural Markdown Link/i);
    expect(citationContent).toMatch(/Section or Block Scope/i);
    expect(citationContent).toMatch(/Footnotes/i);
    expect(citationContent).not.toContain("[Source: Repo /");
  });

  it("defines structured technical research output recipe in SKILL.md", () => {
    const content = fs.readFileSync(SKILL_PATH, "utf8");
    expect(content).toMatch(/Scope & Target Version/i);
    expect(content).toMatch(/Verified Findings/i);
    expect(content).toMatch(/Minimal Verified Snippet/i);
    expect(content).toMatch(/Constraints & Breaking Caveats/i);
  });
});

#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

interface RuleFrontmatter {
  description?: string;
  globs?: string[];
  condition?: string[];
  astCondition?: string[];
  scope?: string[];
  interruptMode?: "always" | "never";
}

function parseRule(filePath: string): { frontmatter: RuleFrontmatter; body: string } {
  const content = fs.readFileSync(filePath, "utf8");
  const parts = content.split(/^---\r?\n/m);
  if (parts.length < 3) {
    throw new Error("Missing frontmatter delimiter in " + filePath);
  }
  const rawYaml = parts[1];
  const body = parts.slice(2).join("---").trim();

  const fm: RuleFrontmatter = {};
  const lines = rawYaml.split(/\r?\n/);
  let currentKey: keyof RuleFrontmatter | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (line.startsWith("  - ") && currentKey) {
      let val = line.slice(4).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      const list = (fm[currentKey] as string[] | undefined) ?? [];
      list.push(val);
      (fm as Record<string, unknown>)[currentKey] = list;
      continue;
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx !== -1) {
      const key = line.slice(0, colonIdx).trim() as keyof RuleFrontmatter;
      const rawVal = line.slice(colonIdx + 1).trim();
      currentKey = key;
      if (rawVal) {
        if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
          try {
            (fm as Record<string, unknown>)[key] = JSON.parse(rawVal);
          } catch {
            (fm as Record<string, unknown>)[key] = rawVal
              .slice(1, -1)
              .split(",")
              .map((s) => s.trim().replace(/^["']|["']$/g, ""));
          }
        } else {
          let val = rawVal;
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          (fm as Record<string, unknown>)[key] = val;
        }
      } else {
        (fm as Record<string, unknown>)[key] = [];
      }
    }
  }

  return { frontmatter: fm, body };
}

describe("given py-collections rule, when parsing frontmatter and evaluating AST conditions, then validate schema and match collection constructors", () => {
  const rulePath = path.resolve(__dirname, "../../rules/py-collections.md");
  const { frontmatter, body } = parseRule(rulePath);

  it("validates required frontmatter fields and body", () => {
    expect(frontmatter.description).toBe("Choose Python collections by semantics");
    expect(frontmatter.globs).toEqual(["**/*.py"]);
    expect(frontmatter.scope).toEqual(["tool:edit(*.py)", "tool:write(*.py)"]);
    expect(frontmatter.interruptMode).toBe("never");
    expect(frontmatter.astCondition).toBeDefined();
    expect(frontmatter.astCondition).toEqual(["set($$$)", "dict($$$)"]);
    expect(body.length).toBeGreaterThan(0);
  });

  it("identifies AST patterns targeting set and dict constructors", () => {
    const patterns = frontmatter.astCondition ?? [];
    expect(patterns).toContain("set($$$)");
    expect(patterns).toContain("dict($$$)");
  });

  it("documents typed dictionary literals and sets over raw dict/set wrappers", () => {
    expect(body).toContain("LABELS: dict[str, str] = {");
    expect(body).toContain("seen_ids: set[str] = set()");
  });
});

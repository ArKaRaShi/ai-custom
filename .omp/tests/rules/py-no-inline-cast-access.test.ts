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

function parseRegex(pattern: string): RegExp {
  let flags = "";
  let cleanPattern = pattern;
  while (cleanPattern.startsWith("(?")) {
    const flagMatch = cleanPattern.match(/^\(\?([mis]+)\)/);
    if (flagMatch) {
      flags += flagMatch[1];
      cleanPattern = cleanPattern.slice(flagMatch[0].length);
    } else {
      break;
    }
  }
  return new RegExp(cleanPattern, flags);
}

describe("given py-no-inline-cast-access rule, when parsing frontmatter and evaluating triggers, then validate schema and detect cast-based member access", () => {
  const rulePath = path.resolve(__dirname, "../../rules/py-no-inline-cast-access.md");
  const { frontmatter, body } = parseRule(rulePath);

  it("validates required frontmatter fields and body", () => {
    expect(frontmatter.description).toBe("Validate Python values before cast-based member access");
    expect(frontmatter.globs).toEqual(["**/*.py"]);
    expect(frontmatter.scope).toEqual(["tool:edit(*.py)", "tool:write(*.py)"]);
    expect(frontmatter.interruptMode).toBe("never");
    expect(frontmatter.condition).toBeDefined();
    expect(frontmatter.condition?.length).toBeGreaterThan(0);
    expect(body.length).toBeGreaterThan(0);
  });

  it("matches positive cast member or item access", () => {
    const regexes = (frontmatter.condition ?? []).map(parseRegex);
    const positiveSnippets = [
      'content = cast(dict[str, object], value)["content"]',
      "name = typing.cast(User, u).name",
      "cast(MyClass, obj).method()",
      "val = cast(list[str], data)[0]",
    ];

    for (const snippet of positiveSnippets) {
      const matches = regexes.some((re) => re.test(snippet));
      expect(matches).toBe(true);
    }
  });

  it("does not match standalone casts or narrowed access", () => {
    const regexes = (frontmatter.condition ?? []).map(parseRegex);
    const negativeSnippets = [
      "user = cast(User, raw_user)",
      "val = typing.cast(int, num)",
      "isinstance(value, Mapping)",
      'content = value.get("content")',
    ];

    for (const snippet of negativeSnippets) {
      const matches = regexes.some((re) => re.test(snippet));
      expect(matches).toBe(false);
    }
  });
});

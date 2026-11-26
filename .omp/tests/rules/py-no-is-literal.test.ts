#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

interface RuleFrontmatter {
  description?: string;
  globs?: string[];
  condition?: string[];
  scope?: string[];
  interruptMode?: string;
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

const rulePath = path.resolve(__dirname, "../../rules/py-no-is-literal.md");
const { frontmatter, body } = parseRule(rulePath);
const conditions = frontmatter.condition ?? [];
const patterns = conditions.map((condition) => new RegExp(condition));

// The trigger guards `is`/`is not` against a literal. These are the shapes that
// must reach the model, because the comparison is silently build-dependent.
const LITERAL_COMPARISONS = [
  ["string literal", 'if status is "success":'],
  ["single-quoted string", "if status is 'success':"],
  ["f-string", 'if label is f"{prefix}":'],
  ["bytes literal", 'if name is b"pump":'],
  ["prefixed bytes literal", 'if name is rb"pump":'],
  ["int literal", "if count is 0:"],
  ["negative int", "if count is -1:"],
  ["float literal", "if ratio is 1.0:"],
  ["list literal", "if items is [1, 2]:"],
  ["dict literal", 'if payload is {"a": 1}:'],
  ["is not string", 'if status is not "ready":'],
  ["is not int", "if count is not 0:"],
  ["is not list", "if items is not []:"],
] as const;

// Identity is the correct operator here. Firing on these would push callers to
// `== None`, `== True`, or an exact-type check rewritten as equality.
const IDENTITY_COMPARISONS = [
  ["None", "if value is None:"],
  ["is not None", "if value is not None:"],
  ["True", "if flag is True:"],
  ["is not False", "if flag is not False:"],
  ["exact type check", "if type(value) is int:"],
  ["Ellipsis name", "if value is Ellipsis:"],
  ["ellipsis token", "if value is ...:"],
  ["identifier operand", "if left is right:"],
] as const;

// Names and prose that merely contain the letters "is".
const NOT_A_COMPARISON = [
  ["function definition", "def is_available(user):"],
  ["function call", "if is_empty(items):"],
  ["attribute access", "return parser.is_ready"],
  ["docstring sentence", '"""The count is ten."""'],
] as const;

describe("given py-no-is-literal rule, when frontmatter is parsed, then schema stays stable", () => {
  it("given the rule file, when read, then identity fields are unchanged", () => {
    expect(frontmatter.description).toBe("Use == instead of is for literal value comparisons");
    expect(frontmatter.globs).toEqual(["**/*.py"]);
    expect(frontmatter.scope).toEqual(["tool:edit(*.py)", "tool:write(*.py)"]);
    expect(frontmatter.interruptMode).toBe("never");
  });

  it("given the condition list, when compiled, then it is one valid regex", () => {
    expect(conditions.length).toBe(1);
    expect(() => new RegExp(conditions[0]!)).not.toThrow();
  });

  it("given the condition, when inspected, then it avoids lookaround so LinearRegExp stays on its fast path", () => {
    for (const condition of conditions) {
      expect(condition).not.toMatch(/\(\?[=!<]/);
    }
  });
});

describe("given a literal comparison, when the condition is tested, then it triggers", () => {
  for (const [label, snippet] of LITERAL_COMPARISONS) {
    it(`given ${label}, when matched, then triggers`, () => {
      const matched = patterns.some((pattern) => pattern.test(snippet));
      expect(matched).toBe(true);
    });
  }
});

describe("given an identity comparison, when the condition is tested, then it stays silent", () => {
  for (const [label, snippet] of IDENTITY_COMPARISONS) {
    it(`given ${label}, when matched, then does not trigger`, () => {
      const matched = patterns.some((pattern) => pattern.test(snippet));
      expect(matched).toBe(false);
    });
  }
});

describe("given a name or sentence containing is, when the condition is tested, then it stays silent", () => {
  for (const [label, snippet] of NOT_A_COMPARISON) {
    it(`given ${label}, when matched, then does not trigger`, () => {
      const matched = patterns.some((pattern) => pattern.test(snippet));
      expect(matched).toBe(false);
    });
  }
});

describe("given the rule body, when read, then it names the carve-outs the trigger relies on", () => {
  it("given the body, when searched, then identity operators are kept for None, bools, and exact types", () => {
    expect(body).toContain("if value is None:");
    expect(body).toContain("if flag is True:");
    expect(body).toContain("type(x) is int");
  });

  it("given the body, when searched, then the empty-list trap is explained", () => {
    expect(body).toContain("is not []` is always `True");
  });
});

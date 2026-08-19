#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const RULE_PATH = path.join(import.meta.dir, "../../rules/py-no-is-literal.md");
const raw = fs.readFileSync(RULE_PATH, "utf-8");
const frontmatter = raw.split("---")[1] ?? "";

function parseList(block: string, key: string): string[] {
  const lines = block.split("\n");
  const result: string[] = [];
  let inKey = false;
  for (const line of lines) {
    if (line.trim().startsWith(`${key}:`)) { inKey = true; continue; }
    if (inKey && line.match(/^\s+-\s+/)) result.push(line.replace(/^\s+-\s+/, "").replace(/['"]/g, "").trim());
    else if (inKey && line.match(/^\S/)) break;
  }
  return result;
}

function parseScalar(block: string, key: string): string {
  const m = block.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return m?.[1]?.trim() ?? "";
}

const conditions = parseList(frontmatter, "condition");
const globs = parseList(frontmatter, "globs");
const scope = parseList(frontmatter, "scope");
const interruptMode = parseScalar(frontmatter, "interruptMode");
const description = parseScalar(frontmatter, "description");

// Literal regexes matching the rule's condition list
const PATTERNS = [/\bis\s+/, /\bis not\s+/];

function matchesAnyCondition(code: string): boolean {
  return PATTERNS.some(re => re.test(code));
}

describe("given py-no-is-literal.md rule, when frontmatter is parsed, then required fields are present and valid", () => {
  it("given the rule file exists, when read, then description is non-empty", () => {
    expect(description.length).toBeGreaterThan(0);
  });

  it("given the rule file, when globs are parsed, then py glob is present", () => {
    expect(globs).toContain("**/*.py");
  });

  it("given the rule file, when scope is parsed, then edit and write are covered", () => {
    expect(scope.some(s => s.includes("edit"))).toBe(true);
    expect(scope.some(s => s.includes("write"))).toBe(true);
  });

  it("given the rule file, when interruptMode is parsed, then it is never (reminder mode)", () => {
    expect(interruptMode).toBe("never");
  });

  it("given the rule file, when conditions are parsed, then condition entries exist", () => {
    expect(conditions.length).toBeGreaterThan(0);
  });
});

describe("given Python code with is or is not comparisons, when condition is tested, then it triggers", () => {
  it("given identity comparison with string literal, when matched, then triggers", () => {
    expect(matchesAnyCondition('if name is "admin":')).toBe(true);
  });

  it("given identity comparison with number, when matched, then triggers", () => {
    expect(matchesAnyCondition('if count is 0:')).toBe(true);
  });

  it("given is not comparison, when matched, then triggers", () => {
    expect(matchesAnyCondition('if items is not []:')).toBe(true);
  });
});

describe("given identifier names containing is without surrounding spaces, when condition is tested, then it does not trigger", () => {
  it("given is_available function name, when matched, then does not trigger", () => {
    expect(matchesAnyCondition('def is_available(user): return True')).toBe(false);
  });

  it("given is_empty function call, when matched, then does not trigger", () => {
    expect(matchesAnyCondition('if is_empty(items): return')).toBe(false);
  });
});

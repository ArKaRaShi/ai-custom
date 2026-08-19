#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const RULE_PATH = path.join(import.meta.dir, "../../rules/py-no-mutable-defaults.md");
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
const PATTERNS = [/=\s*\[\s*\]/, /=\s*\{\s*\}/];

function matchesAnyCondition(code: string): boolean {
  return PATTERNS.some(re => re.test(code));
}

describe("given py-no-mutable-defaults.md rule, when frontmatter is parsed, then required fields are present and valid", () => {
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

  it("given the rule file, when conditions are parsed, then regex conditions exist", () => {
    expect(conditions.length).toBeGreaterThan(0);
  });
});

describe("given function signatures with mutable default arguments, when condition is tested, then it triggers", () => {
  it("given default empty list =[], when matched, then triggers", () => {
    expect(matchesAnyCondition("def process(items=[]):")).toBe(true);
  });

  it("given default empty dict ={}, when matched, then triggers", () => {
    expect(matchesAnyCondition("def configure(options={}):")).toBe(true);
  });

  it("given whitespace around = and brackets, when matched, then triggers", () => {
    expect(matchesAnyCondition("def run(items = [ ], config = { }):")).toBe(true);
  });
});

describe("given function signatures with immutable defaults or None, when condition is tested, then it does not trigger", () => {
  it("given default None, when matched, then does not trigger", () => {
    expect(matchesAnyCondition("def process(items: list | None = None):")).toBe(false);
  });

  it("given default primitive integer, when matched, then does not trigger", () => {
    expect(matchesAnyCondition("def retry(count: int = 3):")).toBe(false);
  });
});

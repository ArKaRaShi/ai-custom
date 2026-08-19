#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const RULE_PATH = path.join(import.meta.dir, "../../rules/py-test-given-when-then.md");
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

const CONDITION = /def test_\w+\(/;

function matchesCondition(code: string): boolean {
  return CONDITION.test(code);
}

describe("given py-test-given-when-then.md rule, when frontmatter is parsed, then required fields are present and valid", () => {
  it("given the rule file exists, when read, then description is non-empty", () => {
    expect(description.length).toBeGreaterThan(0);
  });

  it("given the rule file, when globs are parsed, then Python test patterns are present", () => {
    expect(globs).toContain("test_*.py");
    expect(globs).toContain("**/*_test.py");
    expect(globs).toContain("**/tests/**/*.py");
  });

  it("given the rule file, when scope is parsed, then Python edit and write are covered", () => {
    expect(scope.some(s => s.includes("edit"))).toBe(true);
    expect(scope.some(s => s.includes("write"))).toBe(true);
  });

  it("given the rule file, when interruptMode is parsed, then it is never (reminder mode)", () => {
    expect(interruptMode).toBe("never");
  });

  it("given the rule file, when conditions are parsed, then test function condition exists", () => {
    expect(conditions.length).toBeGreaterThan(0);
  });
});

describe("given Python test functions, when condition is tested, then it triggers reminder", () => {
  it("given a standard test function def test_..., when matched, then triggers reminder", () => {
    expect(matchesCondition("def test_returns_401_on_expired_token():")).toBe(true);
  });

  it("given test function with self argument in TestCase, when matched, then triggers reminder", () => {
    expect(matchesCondition("def test_unmetered_provider(self):")).toBe(true);
  });
});

describe("given non-test Python functions, when condition is tested, then it does not trigger", () => {
  it("given helper function not prefixed with test_, when matched, then does not trigger", () => {
    expect(matchesCondition("def create_mock_client():")).toBe(false);
  });

  it("given setup function, when matched, then does not trigger", () => {
    expect(matchesCondition("def setUp(self):")).toBe(false);
  });
});

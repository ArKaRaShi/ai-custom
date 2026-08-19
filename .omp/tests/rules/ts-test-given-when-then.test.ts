#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const RULE_PATH = path.join(import.meta.dir, "../../rules/ts-test-given-when-then.md");
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

const CONDITION = /describe\(["'](?!given )/;

function matchesCondition(code: string): boolean {
  return CONDITION.test(code);
}

describe("given ts-test-given-when-then.md rule, when frontmatter is parsed, then required fields are present and valid", () => {
  it("given the rule file exists, when read, then description is non-empty", () => {
    expect(description.length).toBeGreaterThan(0);
  });

  it("given the rule file, when globs are parsed, then TS/TSX test patterns are present", () => {
    expect(globs).toContain("**/*.test.ts");
    expect(globs).toContain("**/*.spec.ts");
    expect(globs).toContain("**/*.test.tsx");
    expect(globs).toContain("**/*.spec.tsx");
  });

  it("given the rule file, when scope is parsed, then TS edit and write are covered", () => {
    expect(scope.some(s => s.includes("test.ts"))).toBe(true);
    expect(scope.some(s => s.includes("spec.ts"))).toBe(true);
  });

  it("given the rule file, when interruptMode is parsed, then it is never (reminder mode)", () => {
    expect(interruptMode).toBe("never");
  });

  it("given the rule file, when conditions are parsed, then condition regex exists", () => {
    expect(conditions.length).toBeGreaterThan(0);
  });
});

describe("given a TS describe block without given/when/then, when condition is tested, then it triggers", () => {
  it("given plain name describe, when matched, then triggers", () => {
    expect(matchesCondition(`describe("render12Bar tests", () => {`)).toBe(true);
  });

  it("given single quote plain describe, when matched, then triggers", () => {
    expect(matchesCondition(`describe('auth service tests', () => {`)).toBe(true);
  });
});

describe("given a TS describe block with given/when/then, when condition is tested, then it does not trigger", () => {
  it("given given/when/then describe, when matched, then does not trigger", () => {
    expect(matchesCondition(`describe("given a 0% fraction, when render12Bar is called, then bar is blank", () => {`)).toBe(false);
  });

  it("given single quote given/when/then describe, when matched, then does not trigger", () => {
    expect(matchesCondition(`describe('given expired token, when request made, then 401 returned', () => {`)).toBe(false);
  });
});

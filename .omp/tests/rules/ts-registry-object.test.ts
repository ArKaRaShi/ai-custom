#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const RULE_PATH = path.join(import.meta.dir, "../../rules/ts-registry-object.md");
const raw = fs.readFileSync(RULE_PATH, "utf-8");
const frontmatter = raw.split("---")[1] ?? "";

function parseList(block: string, key: string): string[] {
  const lines = block.split("\n");
  const result: string[] = [];
  let inKey = false;
  for (const line of lines) {
    if (line.trim().startsWith(`${key}:`)) {
      inKey = true;
      continue;
    }
    if (inKey && line.match(/^\s+-\s+/)) result.push(line.replace(/^\s+-\s+/, "").replace(/^['"]|['"]$/g, "").trim());
    else if (inKey && line.match(/^\S/)) break;
  }
  return result;
}

function parseScalar(block: string, key: string): string {
  const found = block.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return found?.[1]?.trim() ?? "";
}

const conditions = parseList(frontmatter, "condition");
const globs = parseList(frontmatter, "globs");
const scope = parseList(frontmatter, "scope");
const interruptMode = parseScalar(frontmatter, "interruptMode");
const repeatMode = parseScalar(frontmatter, "repeatMode");
const description = parseScalar(frontmatter, "description");

// Compile the shipped condition, so the fixtures prove the rule the agent actually gets.
function compile(source: string): RegExp {
  const modifier = source.match(/^\(\?([a-z]+)\)/);
  if (!modifier) return new RegExp(source);
  return new RegExp(source.slice(modifier[0].length), modifier[1]);
}

const shipped = conditions.map(compile);

function matches(code: string): boolean {
  return shipped.some((pattern) => pattern.test(code));
}

const LOWERCASE_REGISTRY = `export const HOOK_CATEGORIES = {
  advisory: { effect: "context", retry: "none" },
  warn: { effect: "context", retry: "none" },
} as const;

export type HookCategory = keyof typeof HOOK_CATEGORIES;`;

describe("given ts-registry-object.md rule, when frontmatter is parsed, then it stays a non-blocking default", () => {
  it("given the rule file, when read, then description and condition are present", () => {
    expect(description.length).toBeGreaterThan(0);
    expect(conditions.length).toBeGreaterThan(0);
  });

  it("given the rule file, when scope and globs are parsed, then TS edit and write are covered", () => {
    expect(globs).toContain("**/*.ts");
    expect(scope).toContain("tool:edit(*.ts)");
    expect(scope).toContain("tool:write(*.ts)");
  });

  it("given the rule file, when reminder settings are parsed, then it never interrupts", () => {
    expect(interruptMode).toBe("never");
    expect(repeatMode).toBe("after-gap");
  });
});

describe("given a registry whose keys are the ids, when a union derives from those keys, then the shipped condition matches", () => {
  it("given lowercase keys with a keyof derivation, when tested, then it matches", () => {
    expect(matches(LOWERCASE_REGISTRY)).toBe(true);
  });
});

describe("given other const objects, when the shipped condition is tested, then it stays quiet", () => {
  it("given a data table with no derivation, when tested, then it does not match", () => {
    expect(matches(`const VALUE_ALLOWLIST = {\n  true: true,\n  false: true,\n} as const;`)).toBe(false);
  });

  it("given a registry whose values are the ids, when tested, then it does not match", () => {
    expect(matches(`const CURRENCY = {\n  USD: "usd",\n  EUR: "eur",\n} as const;\ntype Currency = (typeof CURRENCY)[keyof typeof CURRENCY];`)).toBe(false);
  });

  it("given an already-uppercase registry, when tested, then it does not match", () => {
    expect(matches(`export const HOOK_CATEGORIES = {\n  ADVISORY: { effect: "context" },\n  WARN: { effect: "context" },\n} as const;\nexport type HookCategory = keyof typeof HOOK_CATEGORIES;`)).toBe(false);
  });

  it("given uppercase keys with lowercase nested properties, when tested, then it does not match", () => {
    expect(matches(`export const X = {\n  ALPHA: {\n    effect: "context",\n  },\n} as const;\ntype K = keyof typeof X;`)).toBe(false);
  });
});

#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { compileCondition, parseRule } from "./helpers/frontmatter";
import type { MatchCase } from "./helpers/frontmatter";

interface Fixtures {
  handler: MatchCase[];
  notHandler: MatchCase[];
  bodyMarkers: string[];
}

const rulePath = path.resolve(__dirname, "../../rules/py-no-swallowed-failures.md");
const fixturesPath = path.resolve(__dirname, "fixtures/py-no-swallowed-failures.json");

const { frontmatter, body } = parseRule(rulePath);
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8")) as Fixtures;

const conditions = frontmatter.condition ?? [];
const patterns = conditions.map((condition) => new RegExp(condition));

const GROUPS = [
  { title: "a python failure handler", expected: true, cases: fixtures.handler },
  { title: "a typed or unrelated construct", expected: false, cases: fixtures.notHandler },
] as const;

describe("given py-no-swallowed-failures, when frontmatter is parsed, then the contract is intact", () => {
  it("given the rule file, when read, then it covers python edits only", () => {
    expect(frontmatter.globs).toEqual(["**/*.py"]);
    expect(frontmatter.scope).toEqual(["tool:edit(*.py)", "tool:write(*.py)"]);
  });

  it("given the rule file, when read, then it advises without blocking and only once", () => {
    expect(frontmatter.interruptMode).toBe("never");
    expect(frontmatter.repeatMode).toBe("once");
  });

  it("given the rule file, when read, then the description names the outcome", () => {
    expect(frontmatter.description).toBe("Preserve the distinction between successful results and failures");
  });

  it("given the condition list, when compiled, then every pattern is valid and python-only", () => {
    expect(conditions).toHaveLength(2);
    for (const condition of conditions) {
      expect(() => compileCondition(condition)).not.toThrow();
      expect(condition).not.toMatch(/catch/);
    }
  });
});

describe("given a snippet, when the rule condition is tested, then the verdict matches the fixture group", () => {
  for (const group of GROUPS) {
    describe(`given ${group.title}`, () => {
      for (const { label, snippet } of group.cases) {
        it(`given ${label}, when matched, then ${group.expected ? "triggers" : "stays silent"}`, () => {
          const matched = patterns.some((pattern) => pattern.test(snippet));
          expect(matched).toBe(group.expected);
        });
      }
    });
  }
});

describe("given the rule body, when read, then it carries the decision procedure", () => {
  for (const marker of fixtures.bodyMarkers) {
    it(`given the body, when searched, then it contains ${marker}`, () => {
      expect(body).toContain(marker);
    });
  }
});

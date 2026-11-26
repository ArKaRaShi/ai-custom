#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { compileCondition, parseRule } from "./helpers/frontmatter";
import type { MatchCase } from "./helpers/frontmatter";

interface Fixtures {
  commentLine: MatchCase[];
  notAComment: MatchCase[];
  bodyMarkers: string[];
}

const rulePath = path.resolve(__dirname, "../../rules/py-no-rationalizing-comments.md");
const fixturesPath = path.resolve(__dirname, "fixtures/py-no-rationalizing-comments.json");

const { frontmatter, body } = parseRule(rulePath);
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8")) as Fixtures;

const conditions = frontmatter.condition ?? [];
const patterns = conditions.map(compileCondition);

const GROUPS = [
  { title: "a python full-line comment", expected: true, cases: fixtures.commentLine },
  { title: "a line that holds no python comment", expected: false, cases: fixtures.notAComment },
] as const;

describe("given py-no-rationalizing-comments, when frontmatter is parsed, then the contract is intact", () => {
  it("given the rule file, when read, then it covers python edits only", () => {
    expect(frontmatter.globs).toEqual(["**/*.py"]);
    expect(frontmatter.scope).toEqual(["tool:edit(*.py)", "tool:write(*.py)"]);
  });

  it("given the rule file, when read, then it advises without blocking and only once", () => {
    expect(frontmatter.interruptMode).toBe("never");
    expect(frontmatter.repeatMode).toBe("once");
  });

  it("given the rule file, when read, then the description names the outcome", () => {
    expect(frontmatter.description).toBe("Fix deficiencies instead of rationalizing them with comments");
  });

  it("given the condition list, when compiled, then it matches the hash marker only", () => {
    expect(conditions).toHaveLength(1);
    expect(conditions[0]).toContain("#");
    expect(conditions[0]).not.toContain("//");
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

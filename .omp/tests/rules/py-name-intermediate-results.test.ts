#!/usr/bin/env bun
import { afterAll, describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

interface RuleFrontmatter {
  description?: string;
  globs?: string[];
  condition?: string[];
  astCondition?: string[];
  scope?: string[];
  interruptMode?: string;
  repeatMode?: string;
}

interface MatchCase {
  label: string;
  snippet: string;
}

interface Fixtures {
  nestedCall: MatchCase[];
  singleCall: MatchCase[];
  controlFlowParens: MatchCase[];
  stringOrComment: MatchCase[];
  bodyMarkers: string[];
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

const rulePath = path.resolve(__dirname, "../../rules/py-name-intermediate-results.md");
const fixturesPath = path.resolve(__dirname, "fixtures/py-name-intermediate-results.json");

const { frontmatter, body } = parseRule(rulePath);
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8")) as Fixtures;

// AST conditions are evaluated by the harness, not by this process, so the
// corpus goes through `omp ttsr scan`: one temp file per case, then compare
// which files matched.
const GROUPS = [
  { key: "nestedCall", expected: true },
  { key: "singleCall", expected: false },
  { key: "controlFlowParens", expected: false },
  { key: "stringOrComment", expected: false },
] as const;

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "py-name-intermediate-"));

for (const group of GROUPS) {
  fixtures[group.key].forEach((testCase, index) => {
    const name = `${group.key}-${index}.py`;
    fs.writeFileSync(path.join(workDir, name), testCase.snippet + "\n");
  });
}

const scan = spawnSync(process.env.OMP_BIN ?? "omp", ["ttsr", "scan", "-r", rulePath, "--json", workDir], {
  encoding: "utf8",
});

if (scan.status !== 0) {
  throw new Error(`omp ttsr scan failed (${scan.status}): ${scan.stderr}`);
}

const scanResult = JSON.parse(scan.stdout) as { files: Array<{ filePath: string }> };
const matchedFiles = new Set(scanResult.files.map((file) => path.basename(file.filePath)));

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe("given py-name-intermediate-results, when frontmatter is parsed, then the contract is intact", () => {
  it("given the rule file, when read, then it covers python edits only", () => {
    expect(frontmatter.globs).toEqual(["**/*.py"]);
    expect(frontmatter.scope).toEqual(["tool:edit(*.py)", "tool:write(*.py)"]);
    expect(frontmatter.interruptMode).toBe("never");
  });

  it("given the rule file, when read, then it advises once per session", () => {
    expect(frontmatter.repeatMode).toBe("once");
  });

  it("given the rule file, when read, then the description names the outcome", () => {
    expect(frontmatter.description).toBe("Name intermediate results when nesting obscures intent");
  });

  it("given the trigger, when read, then it is structural rather than textual", () => {
    expect(frontmatter.condition).toBeUndefined();
    expect(frontmatter.astCondition).toHaveLength(4);
  });
});

describe("given a snippet file, when the harness scans it, then the verdict matches the fixture group", () => {
  for (const group of GROUPS) {
    describe(`given ${group.key}`, () => {
      fixtures[group.key].forEach((testCase, index) => {
        const name = `${group.key}-${index}.py`;
        it(`given ${testCase.label}, when scanned, then it ${group.expected ? "triggers" : "stays silent"}`, () => {
          const matched = matchedFiles.has(name);
          expect(matched).toBe(group.expected);
        });
      });
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

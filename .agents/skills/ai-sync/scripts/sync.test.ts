import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  checkGitRemoteStatus,
  matchesPattern,
  filterItems,
  cmdDiff,
} from "./sync";

describe("given pattern filter inputs, when evaluating paths and exclusions, then matches and exclusions are correctly applied", () => {
  it("matches exact relative paths and glob-like wildcard exclusions", () => {
    expect(matchesPattern("prototype/SKILL.md", ["prototype"])).toBe(true);
    expect(matchesPattern(".agents/skills/prototype/UI.md", ["prototype"])).toBe(true);
    expect(matchesPattern(".agents/skills/db-sandbox/SKILL.md", ["prototype"])).toBe(false);
    expect(matchesPattern(".agents/skills/test/temp.log", ["*.log"])).toBe(true);
  });

  it("filters files according to target scope and exclude patterns", () => {
    const files = [
      "skills/db-sandbox/SKILL.md",
      "skills/prototype/SKILL.md",
      "rules/py-test.md",
      "extensions/turn-metrics.ts",
    ];
    // Target only skills, exclude prototype
    const filtered = filterItems(files, { target: "skills", exclude: ["prototype"] });
    expect(filtered).toEqual(["skills/db-sandbox/SKILL.md"]);
  });
});

describe("given a repository directory, when checking git remote tracking status, then returns proper git branch and tracking information", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-test-repo-"));
  });

  afterEach(() => {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("returns isGit: false for non-git directories without crashing", () => {
    const res = checkGitRemoteStatus(tmpRepo);
    expect(res.isGit).toBe(false);
    expect(res.message).toBe("");
  });
});

describe("given two versions of a file, when generating diff view, then returns unified diff output", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-diff-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates unified diff with added and removed lines", () => {
    const fileA = path.join(tmpDir, "local.txt");
    const fileB = path.join(tmpDir, "repo.txt");
    fs.writeFileSync(fileA, "hello world\nline2\n");
    fs.writeFileSync(fileB, "hello world\nline2 modified\n");

    const diffResult = cmdDiff(fileA, fileB);
    expect(diffResult).toContain("line2");
  });
});

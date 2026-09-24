import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { filterItems, matchesPattern } from "../scripts/targets";
import { copyFileSafe, plainMergeFiles, getAllFiles } from "../scripts/sync-files";

describe("path filters", () => {
  it("matches and excludes paths consistently", () => {
    expect(matchesPattern("extensions/foo/SKILL.md", ["foo"])).toBe(true);
    expect(matchesPattern("extensions/bar/SKILL.md", ["foo"])).toBe(false);
    expect(matchesPattern("rules/tmp.log", ["*.log"])).toBe(true);
    const paths = ["extensions/foo/SKILL.md", "extensions/bar/SKILL.md", "rules/py.md"];
    expect(filterItems(paths, { target: "extensions", exclude: ["foo"] })).toEqual(["extensions/bar/SKILL.md"]);
  });
});

describe("sync file helpers", () => {
  let tmpHome: string;
  let tmpRepo: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-sync-home-"));
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-sync-repo-"));
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  });

  it("copyFileSafe writes bytes and creates intermediate directories", () => {
    const src = path.join(tmpHome, "src.txt");
    const dest = path.join(tmpRepo, "deep", "nested", "dest.txt");
    fs.writeFileSync(src, "hello");
    copyFileSafe(src, dest);
    expect(fs.readFileSync(dest, "utf8")).toBe("hello");
  });

  it("getAllFiles skips .DS_Store, node_modules, and .git entries", () => {
    const dir = path.join(tmpHome, "tree");
    fs.mkdirSync(path.join(dir, "sub"), { recursive: true });
    fs.mkdirSync(path.join(dir, "node_modules", "pkg"), { recursive: true });
    fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
    fs.writeFileSync(path.join(dir, "keep.txt"), "k");
    fs.writeFileSync(path.join(dir, ".DS_Store"), "ds");
    fs.writeFileSync(path.join(dir, "sub", "inside.txt"), "i");
    fs.writeFileSync(path.join(dir, "node_modules", "pkg", "x.js"), "x");
    fs.writeFileSync(path.join(dir, ".git", "HEAD"), "ref: refs/heads/main");

    const rels = getAllFiles(dir).map((file) => path.relative(dir, file));
    expect(rels).toContain("keep.txt");
    expect(rels).toContain(path.join("sub", "inside.txt"));
    expect(rels).not.toContain(".DS_Store");
    expect(rels.some((r) => r.startsWith("node_modules"))).toBe(false);
    expect(rels.some((r) => r.startsWith(".git"))).toBe(false);
  });
});


describe("given divergent local and repo files, when plainMergeFiles runs, then non-overlapping edits are combined and overlapping edits yield conflict markers", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-merge-behavior-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("cleanly merges non-overlapping local and repo edits with a common base", () => {
    const base = path.join(tmpDir, "base.txt");
    const local = path.join(tmpDir, "local.txt");
    const repo = path.join(tmpDir, "repo.txt");
    fs.writeFileSync(base, "intro\n\nmiddle\n\noutro\n");
    fs.writeFileSync(local, "intro\n\nmiddle (local)\n\noutro\n");
    fs.writeFileSync(repo, "intro\n\nmiddle\n\noutro (repo)\n");

    const res = plainMergeFiles(local, repo, base);
    expect(res.success).toBe(true);
    expect(res.hasConflicts).toBe(false);
    expect(res.content).toContain("middle (local)");
    expect(res.content).toContain("outro (repo)");
  });

  it("inserts conflict markers when local and repo change the same line", () => {
    const local = path.join(tmpDir, "local.txt");
    const repo = path.join(tmpDir, "repo.txt");
    fs.writeFileSync(local, "name: local\n");
    fs.writeFileSync(repo, "name: repo\n");

    const res = plainMergeFiles(local, repo);
    expect(res.hasConflicts).toBe(true);
    expect(res.content).toContain("<<<<<<<");
    expect(res.content).toContain(">>>>>>>");
  });
});

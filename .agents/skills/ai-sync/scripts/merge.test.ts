import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  plainMergeFiles,
  checkGitRemoteStatus,
  matchesPattern,
  filterItems,
  cmdDiff,
} from "./sync";

describe("given two versions of a file and an optional common base, when running plainMergeFiles, then cleanly merges or produces conflict markers", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-merge-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("cleanly merges distinct non-overlapping changes from local and repo", () => {
    const baseFile = path.join(tmpDir, "base.txt");
    const localFile = path.join(tmpDir, "local.txt");
    const repoFile = path.join(tmpDir, "repo.txt");

    fs.writeFileSync(baseFile, "Header\n\nSection 1\n\nSection 2\n\nFooter\n");
    // Local improved Section 1
    fs.writeFileSync(localFile, "Header\n\nSection 1 (Local Improvement A)\n\nSection 2\n\nFooter\n");
    // Repo improved Section 2
    fs.writeFileSync(repoFile, "Header\n\nSection 1\n\nSection 2 (Repo Improvement B)\n\nFooter\n");

    const res = plainMergeFiles(localFile, repoFile, baseFile);
    expect(res.success).toBe(true);
    expect(res.hasConflicts).toBe(false);
    expect(res.content).toContain("Section 1 (Local Improvement A)");
    expect(res.content).toContain("Section 2 (Repo Improvement B)");
  });

  it("detects line-level collisions and returns conflict markers for agent rephrasing", () => {
    const localFile = path.join(tmpDir, "local.txt");
    const repoFile = path.join(tmpDir, "repo.txt");

    fs.writeFileSync(localFile, "Description: Local Improvement A\n");
    fs.writeFileSync(repoFile, "Description: Repo Improvement B\n");

    const res = plainMergeFiles(localFile, repoFile);
    // Without a base, divergent lines will conflict
    expect(res.hasConflicts).toBe(true);
    expect(res.content).toContain("<<<<<<<");
    expect(res.content).toContain(">>>>>>>");
  });
});

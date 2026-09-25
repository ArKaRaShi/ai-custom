import { describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeSiblingPath, listWorktrees } from "../scripts/worktree";

function runGit(args: string[], cwd: string): { stdout: string; stderr: string; exitCode: number } {
  const proc = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: proc.stdout.toString().trim(),
    stderr: proc.stderr.toString().trim(),
    exitCode: proc.exitCode ?? 1,
  };
}

async function runCli(cwd: string, ...args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const scriptPath = join(import.meta.dir, "../scripts/worktree.ts");
  const proc = Bun.spawn(["bun", scriptPath, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("given isolated-worktree script, when managing git workspaces, then enforces isolation and safe preview", () => {
  it("computes sibling paths alongside the parent repository directory", () => {
    const parentPath = "/Users/test/workspace/my-app";
    const sibling = computeSiblingPath(parentPath, "feature-x");
    expect(sibling).toBe("/Users/test/workspace/my-app-feature-x");

    const sanitized = computeSiblingPath(parentPath, "Feature/JIRA_123!");
    expect(sanitized).toBe("/Users/test/workspace/my-app-feature-jira_123");
  });

  it("lists existing worktrees in human tree format and structured JSON", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "wt-test-list-"));
    try {
      const repoDir = join(tmp, "main-repo");
      mkdirSync(repoDir, { recursive: true });

      runGit(["init", "-b", "main"], repoDir);
      runGit(["config", "user.name", "Test User"], repoDir);
      runGit(["config", "user.email", "test@example.com"], repoDir);
      writeFileSync(join(repoDir, "README.md"), "# Main\n");
      runGit(["add", "."], repoDir);
      runGit(["commit", "-m", "initial"], repoDir);

      const items = listWorktrees(repoDir);
      expect(items.length).toBe(1);
      expect(items[0].branch).toBe("main");

      const treeRes = await runCli(repoDir, "list");
      expect(treeRes.exitCode).toBe(0);
      expect(treeRes.stdout).toContain("isolated-worktree:list");
      expect(treeRes.stdout).toContain("[main]");

      const jsonRes = await runCli(repoDir, "list", "--format=json");
      expect(jsonRes.exitCode).toBe(0);
      const parsed = JSON.parse(jsonRes.stdout);
      expect(parsed.tool).toBe("isolated-worktree");
      expect(Array.isArray(parsed.worktrees)).toBe(true);
      expect(parsed.worktrees.length).toBe(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("creates sibling worktrees and branches without modifying parent", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "wt-test-create-"));
    try {
      const repoDir = join(tmp, "project");
      mkdirSync(repoDir, { recursive: true });

      runGit(["init", "-b", "main"], repoDir);
      runGit(["config", "user.name", "Test User"], repoDir);
      runGit(["config", "user.email", "test@example.com"], repoDir);
      writeFileSync(join(repoDir, "file.txt"), "hello\n");
      runGit(["add", "."], repoDir);
      runGit(["commit", "-m", "init"], repoDir);

      const createRes = await runCli(repoDir, "create", "feat-auth");
      expect(createRes.exitCode).toBe(0);
      expect(createRes.stdout).toContain("isolated-worktree:create");
      expect(createRes.stdout).toContain("feat-auth");

      const expectedSibling = join(tmp, "project-feat-auth");
      expect(existsSync(expectedSibling)).toBe(true);

      const siblingBranch = runGit(["branch", "--show-current"], expectedSibling);
      expect(siblingBranch.stdout).toBe("feat-auth");

      const parentBranch = runGit(["branch", "--show-current"], repoDir);
      expect(parentBranch.stdout).toBe("main");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("defaults remove to non-destructive preview and requires --apply to delete", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "wt-test-remove-"));
    try {
      const repoDir = join(tmp, "project");
      mkdirSync(repoDir, { recursive: true });

      runGit(["init", "-b", "main"], repoDir);
      runGit(["config", "user.name", "Test User"], repoDir);
      runGit(["config", "user.email", "test@example.com"], repoDir);
      writeFileSync(join(repoDir, "file.txt"), "hello\n");
      runGit(["add", "."], repoDir);
      runGit(["commit", "-m", "init"], repoDir);

      await runCli(repoDir, "create", "temp-branch");
      const siblingPath = join(tmp, "project-temp-branch");
      expect(existsSync(siblingPath)).toBe(true);

      // Default remove is a preview
      const previewRes = await runCli(repoDir, "remove", "temp-branch");
      expect(previewRes.exitCode).toBe(0);
      expect(previewRes.stdout).toContain("[preview]");
      expect(existsSync(siblingPath)).toBe(true);

      // Remove with --apply deletes worktree but keeps branch
      const applyRes = await runCli(repoDir, "remove", "temp-branch", "--apply");
      expect(applyRes.exitCode).toBe(0);
      expect(applyRes.stdout).toContain("[apply]");
      expect(existsSync(siblingPath)).toBe(false);

      const branches = runGit(["branch", "--list", "temp-branch"], repoDir);
      expect(branches.stdout).toContain("temp-branch");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("SKILL.md defines REQUIRE SUBSKILL for db-sandbox with non-blocking fallback", () => {
    const skillPath = join(import.meta.dir, "../SKILL.md");
    const content = readFileSync(skillPath, "utf-8");

    expect(content).toContain("**REQUIRE SUBSKILL:** `db-sandbox`");
    expect(content).toContain("without stalling");
  });
});

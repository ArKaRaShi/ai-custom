#!/usr/bin/env bun
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

export function checkGitRemoteStatus(repoDir: string): { isGit: boolean; message: string; ahead: number; behind: number } {
  const result = { isGit: false, message: "", ahead: 0, behind: 0 };
  if (!fs.existsSync(path.join(repoDir, ".git"))) return result;
  result.isGit = true;

  try {
    // Quick status
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: repoDir, stdio: "pipe" }).toString().trim();
    const tracking = execSync("git rev-parse --abbrev-ref @{upstream} 2>/dev/null || true", { cwd: repoDir, stdio: "pipe" }).toString().trim();

    if (!tracking) {
      result.message = `Branch '${branch}' has no remote upstream configured.`;
      return result;
    }

    // Check ahead/behind
    const counts = execSync(`git rev-list --left-right --count ${branch}...@{upstream}`, { cwd: repoDir, stdio: "pipe" }).toString().trim();
    const [ahead, behind] = counts.split(/\s+/).map(Number);
    result.ahead = ahead || 0;
    result.behind = behind || 0;

    if (result.behind > 0 && result.ahead > 0) {
      result.message = `Branch diverged: ${result.ahead} ahead, ${result.behind} behind '${tracking}' (run git pull --rebase)`;
    } else if (result.behind > 0) {
      result.message = `Behind remote: ${result.behind} commit(s) behind '${tracking}' (run 'git pull' or 'ai-sync pull')`;
    } else if (result.ahead > 0) {
      result.message = `Ahead of remote: ${result.ahead} unpushed commit(s) on '${branch}' (run 'git push')`;
    } else {
      result.message = `Up-to-date with remote '${tracking}'`;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    result.message = `Git check failed: ${msg}`;
  }
  return result;
}

export function gitPull(repoDir: string): { success: boolean; output: string } {
  if (!fs.existsSync(path.join(repoDir, ".git"))) {
    return { success: false, output: `Not a git repository: ${repoDir}` };
  }
  try {
    const out = execSync("git pull", { cwd: repoDir, stdio: "pipe" }).toString().trim();
    return { success: true, output: out };
  } catch (e: unknown) {
    const msg = e && typeof e === "object" && "stderr" in e && Buffer.isBuffer(e.stderr)
      ? e.stderr.toString()
      : e instanceof Error ? e.message : String(e);
    return { success: false, output: msg.trim() };
  }
}

export function gitCommitAndPush(repoDir: string, commitMsg = "sync: update backup"): { success: boolean; output: string } {
  if (!fs.existsSync(path.join(repoDir, ".git"))) {
    return { success: false, output: `Not a git repository: ${repoDir}` };
  }
  try {
    const status = execSync("git status --porcelain", { cwd: repoDir, stdio: "pipe" }).toString().trim();
    let commitOut = "";
    if (status) {
      execSync("git add -A", { cwd: repoDir, stdio: "pipe" });
      commitOut = execSync(`git commit -m ${JSON.stringify(commitMsg)}`, { cwd: repoDir, stdio: "pipe" }).toString().trim();
    }
    const pushOut = execSync("git push", { cwd: repoDir, stdio: "pipe" }).toString().trim();
    const output = [commitOut, pushOut].filter(Boolean).join("\n");
    return { success: true, output: output || "Already up to date." };
  } catch (e: unknown) {
    const msg = e && typeof e === "object" && "stderr" in e && Buffer.isBuffer(e.stderr)
      ? e.stderr.toString()
      : e instanceof Error ? e.message : String(e);
    return { success: false, output: msg.trim() };
  }
}

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

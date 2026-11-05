import * as path from "node:path";
import type { GitPushResult, GitPushScope, LocalGitState } from "@/scripts/lib/git";
import { inspectLocalGitState } from "./local-state";
import { runGit } from "./run-git";

/** Remote messages echo URLs, which may carry credentials. */
export function redactUrls(text: string): string {
  return text.replace(/[A-Za-z][A-Za-z0-9+.-]*:\/\/\S+/g, "<url>");
}

/**
 * The Git-relative export set for `targetLocations` (absolute paths inside `repoDir`) and the pending
 * changes outside it. Read-only: never refreshes the index. Null when `repoDir` is not a Git working tree.
 */
export function previewGitPush(repoDir: string, targetLocations: string[]): GitPushScope | null {
  const prefix = runGit(repoDir, ["rev-parse", "--show-prefix"]);
  if (prefix.status !== 0) return null;
  const base = path.resolve(repoDir);
  const exportedPaths = [
    ...new Set(
      targetLocations.map(
        (location) =>
          `${prefix.stdout.trim()}${path.relative(base, location).split(path.sep).join("/")}`,
      ),
    ),
  ].sort();
  try {
    return {
      exportedPaths,
      unrelatedChanges: inspectLocalGitState(repoDir, exportedPaths).unrelatedChanges,
    };
  } catch {
    return null;
  }
}

/**
 * Stages, commits, and pushes only `exportedPaths` (relative to the Git working-tree root). Any other
 * staged, unstaged, or untracked change aborts before anything is staged, committed, or pushed.
 */
export function gitCommitAndPush(
  repoDir: string,
  exportedPaths: string[],
  commitMsg = "sync: update backup",
): GitPushResult {
  let state: LocalGitState;
  try {
    state = inspectLocalGitState(repoDir, exportedPaths);
  } catch {
    return { success: false, code: "GIT_FAILED", output: `Not a git repository: ${repoDir}` };
  }
  if (state.unrelatedChanges.length > 0) {
    return {
      success: false,
      code: "GIT_DIRTY_UNRELATED",
      unrelatedChanges: state.unrelatedChanges,
      output: `Unrelated changes in the backup repository block the commit: ${state.unrelatedChanges.join(", ")}`,
    };
  }

  const failure = (step: string, run: { stdout: string; stderr: string }): GitPushResult => ({
    success: false,
    code: "GIT_FAILED",
    output: redactUrls(`${step} failed: ${(run.stderr || run.stdout).trim()}`),
  });
  const related = state.changedPaths;
  let commitOut = "";
  if (related.length > 0) {
    const add = runGit(repoDir, ["add", "-A", "--", ...related]);
    if (add.status !== 0) return failure("git add", add);
    const hasHead = state.localHead !== "";
    const commit = runGit(repoDir, [
      "commit",
      "-m",
      commitMsg,
      ...(hasHead ? ["--", ...related] : []),
    ]);
    if (commit.status !== 0) return failure("git commit", commit);
    commitOut = commit.stdout.trim();
  }
  const push = runGit(repoDir, ["push"], {
    GIT_TERMINAL_PROMPT: process.env.GIT_TERMINAL_PROMPT ?? "1",
  });
  if (push.status !== 0) return failure("git push", push);
  return {
    success: true,
    output: [commitOut, push.stdout.trim()].filter(Boolean).join("\n") || "Already up to date.",
  };
}

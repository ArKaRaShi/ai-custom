import type { GitPullResult } from "@/scripts/lib/git";
import type { GitPlan } from "@/scripts/lib/plan";
import { findRemoteByHash } from "./local-state";
import { revalidateGitState } from "./remote-preview";
import { runGit } from "./run-git";

/**
 * Revalidates the saved plan, then integrates exactly `savedGit.remoteCommit`.
 * Any failure (including an unresolved conflict) returns `success: false` and leaves no merge
 * in progress, so callers MUST skip dependent restore actions.
 */
export function gitPullChecked(repoDir: string, savedGit: GitPlan): GitPullResult {
  const validation = revalidateGitState(repoDir, savedGit);
  if (!validation.ok) return { success: false, code: validation.code, reason: validation.reason };

  const remote = findRemoteByHash(repoDir, savedGit.remoteUrlHash);
  if (!remote) {
    return {
      success: false,
      code: "GIT_SIMULATION_FAILED",
      reason: "No configured remote matches the saved plan",
    };
  }

  const fetch = runGit(repoDir, ["fetch", "--quiet", "--no-tags", remote, savedGit.remoteRef]);
  if (fetch.status !== 0) {
    return {
      success: false,
      code: "GIT_FAILED",
      reason: `Fetch failed (git exit ${fetch.status})`,
    };
  }
  const fetched = runGit(repoDir, ["rev-parse", "--verify", "FETCH_HEAD^{commit}"]);
  if (fetched.status !== 0 || fetched.stdout.trim() !== savedGit.remoteCommit) {
    return {
      success: false,
      code: "GIT_REMOTE_ADVANCED",
      reason: `Remote ${savedGit.remoteRef} moved after revalidation`,
    };
  }

  const merge = runGit(repoDir, ["merge", "--no-edit", savedGit.remoteCommit]);
  if (merge.status === 0) {
    const head = runGit(repoDir, ["rev-parse", "HEAD"]).stdout.trim();
    return { success: true, output: merge.stdout.trim(), commit: head };
  }

  const mergeInProgress =
    runGit(repoDir, ["rev-parse", "-q", "--verify", "MERGE_HEAD"]).status === 0;
  const conflicted =
    mergeInProgress &&
    runGit(repoDir, ["diff", "--name-only", "--diff-filter=U"]).stdout.trim() !== "";
  if (mergeInProgress) runGit(repoDir, ["merge", "--abort"]);
  const detail = (merge.stderr || merge.stdout).trim().split("\n")[0] ?? "";
  return {
    success: false,
    code: conflicted ? "GIT_CONFLICT" : "GIT_FAILED",
    reason: `Merge failed: ${detail}`,
  };
}

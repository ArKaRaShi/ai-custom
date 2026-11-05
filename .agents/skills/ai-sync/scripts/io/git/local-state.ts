import { createHash } from "node:crypto";
import { isInside, type LocalGitState, sortedUnique } from "@/scripts/lib/git";
import { runGit } from "./run-git";

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Reads HEAD plus index/worktree cleanliness from `git status`, without refreshing the index. */
export function inspectLocalGitState(repo: string, exportedPaths: string[] = []): LocalGitState {
  const status = runGit(repo, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (status.status !== 0) throw new Error("git status failed");
  const head = runGit(repo, ["rev-parse", "--verify", "-q", "HEAD^{commit}"]);
  const fields = status.stdout.split("\0");
  const changed: string[] = [];
  let indexClean = true;
  let worktreeClean = true;
  for (let i = 0; i < fields.length; i++) {
    const entry = fields[i];
    if (!entry) continue;
    const x = entry[0];
    const y = entry[1];
    changed.push(entry.slice(3));
    if (x === "R" || x === "C" || y === "R" || y === "C") changed.push(fields[++i] ?? "");
    if (x !== " " && x !== "?" && x !== "!") indexClean = false;
    if (y !== " " || x === "?") worktreeClean = false;
  }
  const changedPaths = sortedUnique(changed.filter(Boolean));
  return {
    localHead: head.status === 0 ? head.stdout.trim() : "",
    indexClean,
    worktreeClean,
    changedPaths,
    unrelatedChanges: changedPaths.filter(
      (file) => !exportedPaths.some((exported) => isInside(file, exported)),
    ),
  };
}

/** Finds the configured remote whose URL hashes to `urlHash`. */
export function findRemoteByHash(repo: string, urlHash: string): string | undefined {
  const remotes = runGit(repo, ["remote"]).stdout.split("\n").filter(Boolean);
  return remotes.find((name) => {
    const url = runGit(repo, ["remote", "get-url", name]);
    return url.status === 0 && sha256(url.stdout.trim()) === urlHash;
  });
}

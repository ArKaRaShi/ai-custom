/** Git result and preview types shared by the Git gateway and its callers. */

export type PreviewBlockCode =
  | "GIT_UNSUPPORTED_CONFIG"
  | "GIT_SIMULATION_FAILED"
  | "GIT_CONFLICT"
  | "GIT_DIRTY_UNRELATED";

export interface IncomingChange {
  path: string;
  action: "add" | "modify" | "delete";
}

export interface RemoteIntegrationPreview {
  /** sha256 of the remote URL as configured; empty when no remote could be selected. */
  remoteUrlHash: string;
  /** Full ref name, e.g. `refs/heads/main`; empty when it could not be determined. */
  remoteRef: string;
  /** Commit the remote ref pointed at when fetched; empty when the fetch did not happen. */
  remoteCommit: string;
  /** Local HEAD commit; empty when unborn or unreadable. */
  localHead: string;
  indexClean: boolean;
  worktreeClean: boolean;
  /** Paths the integration would change in the local working tree, sorted by path. */
  incoming: IncomingChange[];
  conflicts: string[];
  blocked: { code: PreviewBlockCode; reason: string } | null;
}

export interface PreviewOptions {
  remote?: string;
  ref?: string;
}

export interface LocalGitState {
  localHead: string;
  indexClean: boolean;
  worktreeClean: boolean;
  /** Every path `git status` reports (staged, unstaged, or untracked), sorted. */
  changedPaths: string[];
  /** `changedPaths` not inside any exported path, sorted. */
  unrelatedChanges: string[];
}

export type RevalidationCode =
  | "GIT_REMOTE_ADVANCED"
  | "GIT_DIRTY_UNRELATED"
  | "GIT_CONFLICT"
  | "GIT_SIMULATION_FAILED";

export type RevalidationResult =
  | { ok: true }
  | { ok: false; code: RevalidationCode; reason: string };

export interface GitPushScope {
  /** Paths relative to the Git working-tree root that this push exports. */
  exportedPaths: string[];
  /** Staged, unstaged, or untracked paths outside `exportedPaths`, sorted. */
  unrelatedChanges: string[];
}

export type GitPushResult =
  | { success: true; output: string }
  | {
      success: false;
      output: string;
      code: "GIT_DIRTY_UNRELATED" | "GIT_FAILED";
      unrelatedChanges?: string[];
    };

export type GitPullResult =
  | { success: true; output: string; commit: string }
  | {
      success: false;
      code:
        | "GIT_REMOTE_ADVANCED"
        | "GIT_DIRTY_UNRELATED"
        | "GIT_CONFLICT"
        | "GIT_SIMULATION_FAILED"
        | "GIT_FAILED";
      reason: string;
    };

export interface GitRemoteStatus {
  isGit: boolean;
  message: string;
  ahead: number;
  behind: number;
}

export function pathsOverlap(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

export function isInside(file: string, dir: string): boolean {
  const normalized = dir.replace(/\/+$/, "");
  return file === normalized || file.startsWith(`${normalized}/`);
}

export function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

/** Parses NUL-separated `git diff --name-status -z` output into path-sorted changes. */
export function parseNameStatus(output: string): IncomingChange[] {
  const fields = output
    .split("\0")
    .filter((field, index, all) => field !== "" || index < all.length - 1);
  const changes: IncomingChange[] = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const code = fields[i]?.[0];
    const file = fields[i + 1] as string;
    changes.push({ path: file, action: code === "A" ? "add" : code === "D" ? "delete" : "modify" });
  }
  return changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

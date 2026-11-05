import * as path from "node:path";
import type { RemoteIntegrationPreview } from "@/scripts/lib/git";
import { isWithin, type ResolvedRoot } from "@/scripts/lib/manifest";
import {
  type Digest,
  describeDigest,
  type GitPlan,
  type GitReport,
  type Outcome,
  type Plan,
  type PlanAction,
  type PlanOperation,
  type Result,
  type ResultError,
  resolvedPathId,
  SyncError,
  syncError,
} from "@/scripts/lib/plan";
import { isUnboundedTarget, type SyncOptions } from "@/scripts/lib/targets";

export type PlanSide = "source" | "target";

export const PRUNE_CAVEAT =
  "Git history and remote copies still hold earlier versions: removing a working-tree backup file does not erase them.";

export const ESCAPE_RECOVERY =
  "Replace the symlinked directory with a real directory, or move it out of the managed root, then preview again.";

export const TRANSFER_WORDS = {
  push: {
    noun: "export",
    done: "exported",
    summary: (n: number): string => `backup complete (${n} files backed up)`,
  },
  pull: {
    noun: "import",
    done: "synced",
    summary: (n: number): string => `pull complete (${n} files updated)`,
  },
  prune: {
    noun: "remove",
    done: "removed",
    summary: (n: number): string => `prune complete (${n} backup copies removed)`,
  },
} as const;

/** Applying needs an explicit, bounded target; broad changes go through a reviewed saved plan. */
export function assertReviewedScope(opts: SyncOptions): void {
  const targets = opts.targets ?? [];
  if (targets.length === 0 || targets.some(isUnboundedTarget)) {
    throw syncError(
      "BROAD_SCOPE",
      "Refusing to apply without an explicit target: the selection would include every file the operation affects.",
      null,
      "Preview with --plan-out <file>, review the actions, then run `sync apply <plan-file> --apply`; or pass an explicit --target.",
    );
  }
}

/** A symlink on either side is reported, never followed; otherwise an absent target is a copy. */
export function transferActionType(source: Digest, target: Digest): PlanAction["type"] {
  return source.kind === "symlink" || target.kind === "symlink"
    ? "skip"
    : target.kind === "absent"
      ? "copy"
      : "overwrite";
}

/**
 * Removing a backup file (a prune, or a stale file on a push) deletes regular files only;
 * anything else (symlink, directory, absent) is skipped.
 */
export function removalActionType(target: Digest): PlanAction["type"] {
  return target.kind === "file" ? "delete" : "skip";
}

/** The sides of an action a plan operation reads or writes. A prune never touches the local side. */
export function checkedSides(operation: PlanOperation): readonly PlanSide[] {
  return operation === "prune" ? ["target"] : ["source", "target"];
}

/** The root directory an endpoint hangs from, recovered from its root-relative path. A single-file root is its own boundary. */
export function boundaryOf(location: string, relPath: string): string {
  const tail = path.join(...relPath.split("/"));
  return location.endsWith(`${path.sep}${tail}`)
    ? location.slice(0, location.length - tail.length - 1)
    : location;
}

/** The directory components of `relPath` that a walk beneath `base` must inspect (the file itself is excluded). */
export function directoryParts(relPath: string): string[] {
  return relPath.split("/").slice(0, -1);
}

/** One PATH_ESCAPE error for an action whose `sides` run through a symlink that leaves their root. */
export function escapeError(action: PlanAction, sides: readonly PlanSide[]): ResultError {
  const item = resolvedPathId(action.root, action.path);
  return {
    code: "PATH_ESCAPE",
    item,
    message: `The ${sides.join(" and ")} of ${item} runs through a symlinked directory that leaves its managed root.`,
  };
}

/** Candidate locations of a root-relative path on one side of a root. */
export function locationsFor(
  root: ResolvedRoot,
  relPath: string,
  side: "local" | "repo",
): string[] {
  const base = side === "local" ? root.local : root.repo;
  const joined = path.join(base, ...relPath.split("/"));
  // A path root bound to a single file transfers as that file, not as a directory.
  return root.kind === "path" && relPath === path.basename(root.local) ? [joined, base] : [joined];
}

export function staleItem(
  code: "PLAN_STALE_SOURCE" | "PLAN_STALE_TARGET",
  action: PlanAction,
  side: PlanSide,
  actual: Digest,
): ResultError {
  const planned = action[side];
  return {
    code,
    item: resolvedPathId(action.root, action.path),
    message: `${side[0]?.toUpperCase() ?? ""}${side.slice(1)} ${planned.location} changed since the preview (${describeDigest(planned.digest)} -> ${describeDigest(actual)}).`,
  };
}

/** Snapshot of a selection: scope, hashes, and the computed actions, with no Git plan attached. */
export function assemblePlan(input: {
  operation: PlanOperation;
  repoBase: string;
  headCommit: string | null;
  targets: string[];
  exclude: string[];
  /** push only: the plan also removes stale backup files. */
  removeStale?: boolean;
  actions: PlanAction[];
  policyHash: string;
  bindingsHash: string;
}): Plan {
  const { operation, exclude, actions } = input;
  return {
    version: 1,
    operation,
    repository: { path: path.resolve(input.repoBase), headCommit: input.headCommit },
    scope: {
      roots: [...new Set(actions.map((action) => action.root))].sort(),
      targets: input.targets,
      resolvedPaths: actions.map((action) => resolvedPathId(action.root, action.path)),
      ...(exclude.length > 0 ? { exclude } : {}),
      ...(input.removeStale ? { removeStale: true } : {}),
    },
    policyHash: input.policyHash,
    bindingsHash: input.bindingsHash,
    actions,
    git: null,
  };
}

/** A push removes a backup file only as a stale removal; copies and overwrites are the other push actions. */
export function isStaleRemoval(plan: Plan, action: PlanAction): boolean {
  return plan.operation === "push" && action.type === "delete";
}

/** A stale removal is the only transfer action a Result labels, so a reader can tell it from a copy. */
export function reportedType(plan: Plan, action: PlanAction): { type?: "delete" } {
  return isStaleRemoval(plan, action) ? { type: "delete" } : {};
}

export function toActionError(error: unknown): ResultError {
  if (error instanceof SyncError) {
    return error.errors[0] ?? { code: "IO_FAILED", item: null, message: error.message };
  }
  return {
    code: "IO_FAILED",
    item: null,
    message: error instanceof Error ? error.message : String(error),
  };
}

/** The Result of running a plan: outcome and recovery text follow from what completed, stopped, or was skipped. */
export function executionResult(
  plan: Plan,
  actions: Result["actions"],
  errors: ResultError[],
  flags: { stopped: boolean; skipped: boolean },
): Result {
  const { stopped, skipped } = flags;
  const completed = actions.filter((action) => action.state === "completed").length;
  const outcome: Outcome = !stopped && !skipped ? "success" : completed > 0 ? "partial" : "failed";
  return {
    operation: plan.operation,
    scope: { roots: plan.scope.roots, resolvedPaths: plan.scope.resolvedPaths },
    actions,
    outcome,
    errors,
    recovery:
      outcome === "success"
        ? plan.operation === "prune"
          ? PRUNE_CAVEAT
          : null
        : stopped
          ? `Completed actions stay in place (no rollback). Run a fresh preview to plan the remaining changes.${errors.some((error) => error.code === "PATH_ESCAPE") ? ` ${ESCAPE_RECOVERY}` : ""}${plan.operation === "prune" ? ` ${PRUNE_CAVEAT}` : ""}`
          : plan.operation === "prune"
            ? "Remove symlinked backup copies yourself: ai-sync never follows or deletes symlinks. Then preview again."
            : "Replace symlinked files with regular files or exclude them, then preview again.",
  };
}

export function previewResult(plan: Plan): Result {
  return {
    operation: plan.operation,
    scope: { roots: plan.scope.roots, resolvedPaths: plan.scope.resolvedPaths },
    actions: plan.actions.map((action) => ({
      id: action.id,
      state: "proposed" as const,
      ...reportedType(plan, action),
    })),
    outcome: "preview",
    errors: [],
    recovery:
      plan.actions.length === 0
        ? null
        : "Review the actions, then run `sync apply <plan-file> --apply` for a plan saved with --plan-out, or repeat the command with an explicit --target and --apply." +
          (plan.operation === "prune" ? ` ${PRUNE_CAVEAT}` : ""),
  };
}

/**
 * A failed result for a step (Git, or a stale-plan check) that stopped before any file action ran:
 * every action is reported as not attempted.
 */
export function gitStoppedResult(
  plan: Plan,
  errors: ResultError[],
  recovery: string,
  git?: GitReport,
): Result {
  return {
    operation: plan.operation,
    scope: { roots: plan.scope.roots, resolvedPaths: plan.scope.resolvedPaths },
    actions: plan.actions.map((action) => ({
      id: action.id,
      state: "not_attempted" as const,
      ...reportedType(plan, action),
    })),
    outcome: "failed",
    errors,
    recovery,
    ...(git ? { git } : {}),
  };
}

export function gitNotes(git: GitReport | undefined): string[] {
  if (!git) return [];
  const notes: string[] = [];
  if (git.remoteCommit) {
    notes.push(`git remote ${git.remoteRef ?? ""} at ${git.remoteCommit.slice(0, 12)}`);
  }
  for (const change of git.incoming ?? [])
    notes.push(`git incoming ${change.action}: ${change.path}`);
  for (const file of git.conflicts ?? []) notes.push(`git conflict: ${file}`);
  if (git.exportedPaths) {
    notes.push(`git exports ${git.exportedPaths.length} path(s): ${git.exportedPaths.join(", ")}`);
  }
  if (git.unrelatedChanges && git.unrelatedChanges.length > 0) {
    notes.push(`git unrelated changes: ${git.unrelatedChanges.join(", ")}`);
  }
  if (git.limitation) notes.push(`git limitation: ${git.limitation}`);
  return notes;
}

/**
 * Incoming backup paths that fall inside a managed root, so a restore would read what the pull
 * changes. `prefix` is the repository's path inside its Git working tree.
 */
export function dependentIncoming(
  prefix: string,
  repoBase: string,
  rootRepoDirs: string[],
  incoming: { path: string }[],
): string[] {
  const base = path.resolve(repoBase);
  return incoming
    .map((change) => change.path)
    .filter(
      (file) =>
        file.startsWith(prefix) &&
        rootRepoDirs.some((dir) =>
          isWithin(dir, path.join(base, ...file.slice(prefix.length).split("/"))),
        ),
    );
}

/** Git facts for a pull preview: remote state, incoming changes, pending local changes, and any restore limitation. */
export function pullGitReport(
  preview: RemoteIntegrationPreview,
  pending: string[],
  dependent: string[],
): GitReport {
  return {
    ...(preview.remoteRef ? { remoteRef: preview.remoteRef } : {}),
    ...(preview.remoteCommit ? { remoteCommit: preview.remoteCommit } : {}),
    incoming: preview.incoming,
    conflicts: preview.conflicts,
    unrelatedChanges: pending,
    ...(dependent.length > 0
      ? {
          limitation: `The pull changes ${dependent.slice(0, 5).join(", ")}, which restore actions read; the listed actions use the current backup files and the exact restore is determined after the pull.`,
        }
      : {}),
  };
}

/** The Git half of a saved pull plan. */
export function pullGitPlan(preview: RemoteIntegrationPreview, pending: string[]): GitPlan {
  return {
    remoteUrlHash: preview.remoteUrlHash,
    remoteRef: preview.remoteRef,
    remoteCommit: preview.remoteCommit,
    localHead: preview.localHead,
    indexClean: preview.indexClean,
    worktreeClean: preview.worktreeClean,
    exportedPaths: [],
    unrelatedChanges: pending,
  };
}

/** The error that stops a saved plan from carrying a pull whose dependent restores cannot be known. */
export function dependentPlanError(dependent: string[]): SyncError {
  return syncError(
    "GIT_SIMULATION_FAILED",
    `Cannot save a plan: the pull changes ${dependent.slice(0, 5).join(", ")}, which its restore actions read, so the exact actions are unknown before the pull.`,
    null,
    "Apply directly with `sync pull --git-pull --apply --target <scope>` after reviewing this preview.",
  );
}

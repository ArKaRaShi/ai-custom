import * as path from "node:path";
import type { Io } from "@/scripts/io/io";
import { isWithin } from "@/scripts/lib/manifest";
import {
  type Plan,
  type PlanAction,
  type ResultError,
  SyncError,
  syncError,
} from "@/scripts/lib/plan";
import {
  assemblePlan,
  boundaryOf,
  checkedSides,
  directoryParts,
  ESCAPE_RECOVERY,
  escapeError,
  type PlanSide,
  removalActionType,
  transferActionType,
} from "@/scripts/lib/plan-rules";
import { savePlan as writePlanOutsideRoots } from "@/scripts/lib/plan-store";
import { loadRoots, scanExcludedCopies, scanTargets } from "@/scripts/lib/root-scanner";
import {
  bindingsHashOf,
  type EntryState,
  type PruneScan,
  policyHashOf,
  type ScanResult,
  selectCopies,
  selectEntries,
  unknownTargetError,
} from "@/scripts/lib/scan";
import { matchesTarget } from "@/scripts/lib/target-matcher";
import type { SyncOptions } from "@/scripts/lib/targets";

// Turns a scan and an explicit selection into a reviewable change plan. Read-only except `saveGuardedPlan`.

/** Snapshot the selected scope, policy, bindings, and source and target fingerprints. Read-only. */
export function buildTransferPlan(
  io: Io,
  operation: "push" | "pull",
  repoBase: string,
  opts: SyncOptions = {},
): Plan {
  const { git } = io;
  const scanned = scanTargets(io, repoBase, opts);
  const targets = (opts.targets ?? []).map((target) => target.trim());
  const actions = computeActions(io, operation, scanned, targets, opts.removeStale === true);
  return assemblePlan({
    operation,
    repoBase,
    headCommit: git.headCommit(repoBase),
    targets,
    exclude: opts.exclude ?? [],
    removeStale: opts.removeStale === true,
    actions,
    policyHash: policyHashOf(scanned.manifest),
    bindingsHash: bindingsHashOf(scanned.roots),
  });
}

/**
 * Snapshot the excluded backup copies in scope, the policy, bindings, and each backup file's
 * fingerprint. Read-only. The source of each action is the local counterpart, recorded so the
 * review shows what stays; apply never reads or compares it.
 */
export function buildPrunePlan(io: Io, repoBase: string, opts: SyncOptions = {}): Plan {
  const { git } = io;
  const scanned = scanExcludedCopies(io, repoBase, opts);
  const targets = (opts.targets ?? []).map((target) => target.trim());
  const actions = computePruneActions(io, scanned, targets);
  return assemblePlan({
    operation: "prune",
    repoBase,
    headCommit: git.headCommit(repoBase),
    targets,
    exclude: opts.exclude ?? [],
    actions,
    policyHash: policyHashOf(scanned.manifest),
    bindingsHash: bindingsHashOf(scanned.roots),
  });
}

/**
 * The actions that bring the target side in line with the source side. With `removeStale`, a push
 * also removes each selected backup file that has no local counterpart (state `new_repo`);
 * policy-excluded copies never reach this point, they belong to `prune`.
 */
export function computeActions(
  io: Io,
  operation: "push" | "pull",
  scanned: ScanResult,
  targets: string[],
  removeStale = false,
): PlanAction[] {
  const { fileSystem } = io;
  const { selected, unknown } = selectEntries(scanned, targets, (raw, candidate) =>
    matchesTarget(io, raw, candidate),
  );
  if (unknown.length > 0) throw unknownTargetError(unknown);
  const wanted: EntryState[] =
    operation === "push"
      ? removeStale
        ? ["new_local", "modified", "new_repo"]
        : ["new_local", "modified"]
      : ["new_repo", "modified"];
  const actions = selected
    .filter((entry) => wanted.includes(entry.state))
    .flatMap((entry): Omit<PlanAction, "id">[] => {
      const from = operation === "push" ? entry.local : entry.repo;
      const to = operation === "push" ? entry.repo : entry.local;
      const source = { location: from, digest: fileSystem.digest(from) };
      const target = { location: to, digest: fileSystem.digest(to) };
      const stale = operation === "push" && entry.state === "new_repo";
      // A local path the scan ignored (symlink, directory) still counts as a local counterpart.
      if (stale && source.digest.kind !== "absent") return [];
      const type = stale
        ? removalActionType(target.digest)
        : transferActionType(source.digest, target.digest);
      return [{ type, root: entry.root, path: entry.path, source, target }];
    })
    .map((action, index): PlanAction => ({ id: `a${index + 1}`, ...action }));
  const escaped = escapeErrors(io, actions);
  if (escaped.length > 0) throw new SyncError(escaped, ESCAPE_RECOVERY);
  return actions;
}

export function computePruneActions(io: Io, scanned: PruneScan, targets: string[]): PlanAction[] {
  const { fileSystem } = io;
  const { selected, unknown } = selectCopies(scanned, targets, (raw, candidate) =>
    matchesTarget(io, raw, candidate),
  );
  if (unknown.length > 0) throw unknownTargetError(unknown);
  const actions = selected.map((copy, index): PlanAction => {
    const target = { location: copy.repo, digest: fileSystem.digest(copy.repo) };
    return {
      id: `a${index + 1}`,
      type: removalActionType(target.digest),
      root: copy.root,
      path: copy.path,
      source: { location: copy.local, digest: fileSystem.digest(copy.local) },
      target,
    };
  });
  const escaped = escapeErrors(io, actions, checkedSides("prune"));
  if (escaped.length > 0) throw new SyncError(escaped, ESCAPE_RECOVERY);
  return actions;
}

/**
 * True when a directory component of `relPath` beneath `base` is a symlink that resolves
 * outside `base` or to nothing. Symlinked directories that stay inside the root are allowed.
 * The final component is not followed here: a symlinked file is reported as a skipped action.
 * Components that do not exist yet cannot redirect a write, so the walk stops at the first one.
 */
export function pathEscapesRoot(io: Io, base: string, relPath: string): boolean {
  const { fileSystem } = io;
  let current = base;
  for (const part of directoryParts(relPath)) {
    current = path.join(current, part);
    let isSymbolicLink: boolean;
    try {
      isSymbolicLink = fileSystem.lstat(current).isSymbolicLink;
    } catch (error) {
      const code = error instanceof Error && "code" in error ? error.code : undefined;
      if (code === "ENOENT" || code === "ENOTDIR") return false;
      throw syncError(
        "IO_FAILED",
        `Cannot inspect ${current}: ${(error as Error).message}`,
        current,
      );
    }
    if (!isSymbolicLink) continue;
    try {
      if (!isWithin(fileSystem.realpath(base), fileSystem.realpath(current))) return true;
    } catch {
      return true;
    }
  }
  return false;
}

/** One PATH_ESCAPE error per action whose source or target runs through a symlink that leaves its root. */
export function escapeErrors(
  io: Io,
  actions: PlanAction[],
  checked: readonly PlanSide[] = ["source", "target"],
): ResultError[] {
  const errors: ResultError[] = [];
  for (const action of actions) {
    const sides = checked.filter((side) =>
      pathEscapesRoot(io, boundaryOf(action[side].location, action.path), action.path),
    );
    if (sides.length > 0) errors.push(escapeError(action, sides));
  }
  return errors;
}

/** A plan file is an output artifact: it must not land inside the backup or a managed root. */
export function saveGuardedPlan(io: Io, plan: Plan, file: string): string {
  const guarded = [
    plan.repository.path,
    ...loadRoots(io, plan.repository.path).roots.map((root) => root.local),
  ];
  return writePlanOutsideRoots(io, plan, file, guarded);
}

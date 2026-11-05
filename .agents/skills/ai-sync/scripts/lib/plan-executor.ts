import * as path from "node:path";
import type { Io } from "@/scripts/io/io";
import { loadUnifiedManifest } from "@/scripts/lib/manifest-repository";
import {
  digestEquals,
  type Plan,
  type PlanAction,
  type Result,
  type ResultError,
  resolvedPathId,
  SyncError,
  syncError,
} from "@/scripts/lib/plan";
import { escapeErrors } from "@/scripts/lib/plan-builder";
import {
  checkedSides,
  executionResult,
  reportedType,
  staleItem,
  toActionError,
} from "@/scripts/lib/plan-rules";
import { policyHashOf } from "@/scripts/lib/scan";
import { isExcludedByPolicy } from "@/scripts/lib/target-matcher";

export interface ExecuteHooks {
  /** Called immediately before an action's precondition check; lets tests simulate concurrent edits. */
  beforeAction?: (action: PlanAction, index: number) => void;
}

/**
 * Execute a plan action by action. Each action's source and target are re-fingerprinted
 * immediately before it is written; the first failure stops the rest. No rollback is claimed.
 */
export function executePlan(io: Io, plan: Plan, hooks: ExecuteHooks = {}): Result {
  const { fileSystem } = io;
  const actions: Result["actions"] = [];
  const errors: ResultError[] = [];
  let stopped = false;
  let skipped = false;

  for (const [index, action] of plan.actions.entries()) {
    const item = resolvedPathId(action.root, action.path);
    const kind = reportedType(plan, action);
    if (stopped) {
      actions.push({ id: action.id, state: "not_attempted", ...kind });
      continue;
    }
    if (action.type === "skip") {
      skipped = true;
      const message = `${item} involves a symlink; symlinks are reported but never followed.`;
      actions.push({ id: action.id, state: "not_attempted", error: message, ...kind });
      errors.push({ code: "SYMLINK_UNSUPPORTED", item, message });
      continue;
    }
    try {
      hooks.beforeAction?.(action, index);
      const escaped = escapeErrors(io, [action], checkedSides(plan.operation));
      if (escaped.length > 0) throw new SyncError(escaped);
      if (plan.operation !== "prune") {
        const source = fileSystem.digest(action.source.location);
        if (!digestEquals(source, action.source.digest)) {
          throw new SyncError([staleItem("PLAN_STALE_SOURCE", action, "source", source)]);
        }
      }
      const target = fileSystem.digest(action.target.location);
      if (!digestEquals(target, action.target.digest)) {
        throw new SyncError([staleItem("PLAN_STALE_TARGET", action, "target", target)]);
      }
      const removes = action.type === "delete" && plan.operation !== "pull";
      const copies =
        (action.type === "copy" || action.type === "overwrite") && plan.operation !== "prune";
      if (!removes && !copies) {
        throw syncError("PLAN_INVALID", `Unsupported action type: ${action.type}`, action.id);
      }
      if (removes) {
        if (plan.operation === "prune" && !isApprovedRemoval(io, plan, action)) {
          throw syncError(
            "PLAN_STALE_POLICY",
            `The shared sync policy changed since the preview; ${item} is no longer an approved removal.`,
            item,
          );
        }
        fileSystem.unlink(action.target.location);
        removeEmptyParents(io, plan, action);
      } else {
        fileSystem.copyFile(action.source.location, action.target.location);
      }
      actions.push({ id: action.id, state: "completed", ...kind });
    } catch (error) {
      stopped = true;
      const failure = toActionError(error);
      actions.push({ id: action.id, state: "failed", error: failure.message, ...kind });
      errors.push({ ...failure, item: failure.item ?? item });
    }
  }

  return executionResult(plan, actions, errors, { stopped, skipped });
}

/** The policy is unchanged since the preview and still excludes this backup file. */
function isApprovedRemoval(io: Io, plan: Plan, action: PlanAction): boolean {
  try {
    const manifest = loadUnifiedManifest(io, plan.repository.path);
    return (
      policyHashOf(manifest) === plan.policyHash &&
      isExcludedByPolicy(io, manifest, action.root, action.path)
    );
  } catch {
    return false;
  }
}

/** Removes directories a removal emptied, stopping before the root's own backup folder. */
function removeEmptyParents(io: Io, plan: Plan, action: PlanAction): void {
  const { fileSystem } = io;
  const manifest = loadUnifiedManifest(io, plan.repository.path);
  const repoRoot = manifest.roots[action.root]?.repoRoot;
  if (repoRoot === undefined) return;
  const stop = path.join(plan.repository.path, repoRoot);
  let dir = path.dirname(action.target.location);
  while (dir.startsWith(stop + path.sep) && fileSystem.removeDirIfEmpty(dir)) {
    dir = path.dirname(dir);
  }
}

import type { FileSystem } from "@/scripts/application/interfaces/file-system";
import type { ManifestRepository } from "@/scripts/application/services/manifest-repository";
import type { PlanBuilder } from "@/scripts/application/services/plan-builder";
import type { TargetMatcher } from "@/scripts/application/services/target-matcher";
import {
  digestEquals,
  type Plan,
  type PlanAction,
  type Result,
  type ResultError,
  resolvedPathId,
  SyncError,
  syncError,
} from "@/scripts/domain/plan";
import {
  checkedSides,
  executionResult,
  staleItem,
  toActionError,
} from "@/scripts/domain/plan-rules";
import { policyHashOf } from "@/scripts/domain/scan";

export interface ExecuteHooks {
  /** Called immediately before an action's precondition check; lets tests simulate concurrent edits. */
  beforeAction?: (action: PlanAction, index: number) => void;
}

export interface PlanExecutorDeps {
  fileSystem: FileSystem;
  manifestRepository: ManifestRepository;
  planBuilder: PlanBuilder;
  targetMatcher: TargetMatcher;
}

/** Runs a verified plan action by action. */
export class PlanExecutor {
  constructor(private readonly deps: PlanExecutorDeps) {}

  /**
   * Execute a plan action by action. Each action's source and target are re-fingerprinted
   * immediately before it is written; the first failure stops the rest. No rollback is claimed.
   */
  executePlan(plan: Plan, hooks: ExecuteHooks = {}): Result {
    const { fileSystem, planBuilder } = this.deps;
    const actions: Result["actions"] = [];
    const errors: ResultError[] = [];
    let stopped = false;
    let skipped = false;

    for (const [index, action] of plan.actions.entries()) {
      const item = resolvedPathId(action.root, action.path);
      if (stopped) {
        actions.push({ id: action.id, state: "not_attempted" });
        continue;
      }
      if (action.type === "skip") {
        skipped = true;
        const message = `${item} involves a symlink; symlinks are reported but never followed.`;
        actions.push({ id: action.id, state: "not_attempted", error: message });
        errors.push({ code: "SYMLINK_UNSUPPORTED", item, message });
        continue;
      }
      try {
        hooks.beforeAction?.(action, index);
        const escaped = planBuilder.escapeErrors([action], checkedSides(plan.operation));
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
        if (plan.operation === "prune") {
          if (action.type !== "delete") {
            throw syncError("PLAN_INVALID", `Unsupported action type: ${action.type}`, action.id);
          }
          if (!this.isApprovedRemoval(plan, action)) {
            throw syncError(
              "PLAN_STALE_POLICY",
              `The shared sync policy changed since the preview; ${item} is no longer an approved removal.`,
              item,
            );
          }
          fileSystem.unlink(action.target.location);
        } else {
          if (action.type !== "copy" && action.type !== "overwrite") {
            throw syncError("PLAN_INVALID", `Unsupported action type: ${action.type}`, action.id);
          }
          fileSystem.copyFile(action.source.location, action.target.location);
        }
        actions.push({ id: action.id, state: "completed" });
      } catch (error) {
        stopped = true;
        const failure = toActionError(error);
        actions.push({ id: action.id, state: "failed", error: failure.message });
        errors.push({ ...failure, item: failure.item ?? item });
      }
    }

    return executionResult(plan, actions, errors, { stopped, skipped });
  }

  /** The policy is unchanged since the preview and still excludes this backup file. */
  private isApprovedRemoval(plan: Plan, action: PlanAction): boolean {
    const { manifestRepository, targetMatcher } = this.deps;
    try {
      const manifest = manifestRepository.loadUnifiedManifest(plan.repository.path);
      return (
        policyHashOf(manifest) === plan.policyHash &&
        targetMatcher.isExcludedByPolicy(manifest, action.root, action.path)
      );
    } catch {
      return false;
    }
  }
}

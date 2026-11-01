import type { FileSystem } from "@/scripts/application/interfaces/file-system";
import type { PlanBuilder } from "@/scripts/application/services/plan-builder";
import type { RootScanner } from "@/scripts/application/services/root-scanner";
import {
  digestEquals,
  type Plan,
  type PlanAction,
  type ResultError,
  resolvedPathId,
  SyncError,
  syncError,
} from "@/scripts/domain/plan";
import { checkedSides, locationsFor, staleItem } from "@/scripts/domain/plan-rules";
import { bindingsHashOf, type LoadedRoots, policyHashOf } from "@/scripts/domain/scan";

export interface PlanVerifierDeps {
  fileSystem: FileSystem;
  planBuilder: PlanBuilder;
  rootScanner: RootScanner;
}

/** Rechecks a saved plan against current state without mutating anything. */
export class PlanVerifier {
  constructor(private readonly deps: PlanVerifierDeps) {}

  /**
   * Recompute every precondition of a saved plan against current state without
   * mutating anything. An empty result means the plan is still exact.
   */
  verifyPlan(plan: Plan): ResultError[] {
    const { fileSystem, planBuilder, rootScanner } = this.deps;
    let loaded: LoadedRoots;
    try {
      loaded = rootScanner.loadRoots(plan.repository.path);
    } catch (error) {
      return [
        {
          code: "PLAN_STALE_POLICY",
          item: null,
          message: `Policy or root bindings can no longer be loaded: ${(error as Error).message}`,
        },
      ];
    }
    const errors: ResultError[] = [];
    if (policyHashOf(loaded.manifest) !== plan.policyHash) {
      errors.push({
        code: "PLAN_STALE_POLICY",
        item: null,
        message: "The shared sync policy changed since the preview.",
      });
    }
    if (bindingsHashOf(loaded.roots) !== plan.bindingsHash) {
      errors.push({
        code: "PLAN_STALE_POLICY",
        item: null,
        message: "Machine-local root bindings changed since the preview.",
      });
    }
    if (errors.length > 0) return errors;

    for (const action of plan.actions) {
      const root = loaded.roots.find((candidate) => candidate.id === action.root);
      if (!root) {
        throw syncError(
          "PLAN_INVALID",
          `Action ${action.id} names an unknown root: ${action.root}`,
          action.id,
        );
      }
      const [from, to] =
        plan.operation === "pull" ? (["repo", "local"] as const) : (["local", "repo"] as const);
      if (
        !locationsFor(root, action.path, from).includes(action.source.location) ||
        !locationsFor(root, action.path, to).includes(action.target.location)
      ) {
        throw syncError(
          "PLAN_INVALID",
          `Action ${action.id} locations do not match root ${action.root} for ${action.path}`,
          action.id,
        );
      }
    }

    const escaped = planBuilder.escapeErrors(plan.actions, checkedSides(plan.operation));
    if (escaped.length > 0) return escaped;

    for (const action of plan.actions) {
      if (plan.operation !== "prune") {
        const source = fileSystem.digest(action.source.location);
        if (!digestEquals(source, action.source.digest)) {
          errors.push(staleItem("PLAN_STALE_SOURCE", action, "source", source));
        }
      }
      const target = fileSystem.digest(action.target.location);
      if (!digestEquals(target, action.target.digest)) {
        errors.push(staleItem("PLAN_STALE_TARGET", action, "target", target));
      }
    }
    if (errors.length > 0) return errors;

    let current: PlanAction[];
    try {
      current =
        plan.operation === "prune"
          ? planBuilder.computePruneActions(
              rootScanner.scanExcludedCopies(plan.repository.path, { exclude: plan.scope.exclude }),
              plan.scope.targets,
            )
          : planBuilder.computeActions(
              plan.operation === "push" ? "push" : "pull",
              rootScanner.scanTargets(plan.repository.path, { exclude: plan.scope.exclude }),
              plan.scope.targets,
            );
    } catch (error) {
      if (error instanceof SyncError) {
        return [
          {
            code: "PLAN_STALE_SCOPE",
            item: null,
            message: `The saved targets no longer resolve: ${error.message}`,
          },
        ];
      }
      throw error;
    }
    const now = new Set(current.map((action) => resolvedPathId(action.root, action.path)));
    const planned = new Set(plan.scope.resolvedPaths);
    for (const id of now) {
      if (!planned.has(id)) {
        errors.push({
          code: "PLAN_STALE_SCOPE",
          item: id,
          message: `${id} now falls inside the scope but was not in the plan.`,
        });
      }
    }
    for (const id of planned) {
      if (!now.has(id)) {
        errors.push({
          code: "PLAN_STALE_SCOPE",
          item: id,
          message: `${id} no longer needs the planned change.`,
        });
      }
    }
    return errors;
  }
}

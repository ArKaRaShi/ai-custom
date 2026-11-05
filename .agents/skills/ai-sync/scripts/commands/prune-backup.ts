import type { Io } from "@/scripts/io/io";
import { type Plan, type Result, syncError } from "@/scripts/lib/plan";
import { buildPrunePlan, saveGuardedPlan } from "@/scripts/lib/plan-builder";
import { executePlan } from "@/scripts/lib/plan-executor";
import { assertReviewedScope, previewResult } from "@/scripts/lib/plan-rules";
import type { SyncOptions } from "@/scripts/lib/targets";

export interface PruneBackupInput {
  repoBase: string;
  opts: SyncOptions;
}

/** What a prune produced; `result` is the JSON envelope, the rest drives the tree renderers. */
export type PruneBackupOutput =
  | {
      kind: "preview";
      result: Result;
      plan: Plan;
      /** Resolved path of the saved plan file, when `--plan-out` was given. */
      planFile?: string;
    }
  | { kind: "applied"; result: Result; plan: Plan };

/** Previews, or with `--apply` and a bounded target, removes backup copies of items the policy excludes. */
export function pruneBackup(io: Io, input: PruneBackupInput): PruneBackupOutput {
  const { repoBase, opts } = input;
  const apply = opts.apply === true;
  if (apply && opts.planOut) {
    throw syncError(
      "PLAN_INVALID",
      "--plan-out saves a preview; it cannot be combined with --apply.",
      null,
      "Remove --apply to save the plan, then run `sync apply <plan-file> --apply`.",
    );
  }
  if (opts.gitPull || opts.gitPush) {
    throw syncError(
      "PLAN_INVALID",
      "prune changes working-tree files only; it takes no Git options.",
      null,
      "Remove --git-pull and --git-push.",
    );
  }
  if (apply) assertReviewedScope(opts);

  const plan = buildPrunePlan(io, repoBase, opts);
  if (plan.actions.length === 0 && ((opts.targets?.length ?? 0) > 0 || apply || opts.planOut)) {
    throw syncError(
      "EMPTY_SCOPE",
      "The selection resolved to no excluded backup copies to remove.",
      null,
      "List the candidates with `sync prune` (no target), or choose a target that has an excluded backup copy.",
    );
  }
  const planFile = opts.planOut ? saveGuardedPlan(io, plan, opts.planOut) : undefined;

  if (!apply) return { kind: "preview", result: previewResult(plan), plan, planFile };
  return { kind: "applied", result: executePlan(io, plan), plan };
}

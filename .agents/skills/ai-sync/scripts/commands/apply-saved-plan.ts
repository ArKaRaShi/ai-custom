import type { Io } from "@/scripts/io/io";
import { type GitReport, type Plan, type Result, syncError } from "@/scripts/lib/plan";
import { type ExecuteHooks, executePlan } from "@/scripts/lib/plan-executor";
import { gitNotes, gitStoppedResult, previewResult } from "@/scripts/lib/plan-rules";
import { readPlanFile } from "@/scripts/lib/plan-store";
import { verifyPlan } from "@/scripts/lib/plan-verifier";
import type { SyncOptions } from "@/scripts/lib/targets";

export interface ApplySavedPlanInput {
  planFile: string;
  opts: SyncOptions;
  /** Test seam: observes each action just before its preconditions are rechecked. */
  hooks?: ExecuteHooks;
}

/** What rechecking or applying a saved plan produced; `result` is the JSON envelope. */
export type ApplySavedPlanOutput =
  | { kind: "rejected"; result: Result; plan: Plan }
  | { kind: "git-stopped"; phase: "preview" | "apply"; result: Result; plan: Plan }
  | {
      kind: "preview";
      result: Result;
      plan: Plan;
      /** Notes shown above the file list. */
      notes: string[];
    }
  | {
      kind: "applied";
      result: Result;
      plan: Plan;
      /** Extra tree lines (e.g. the Git pull outcome) shown after the file list. */
      extraLines: string[];
    };

const STALE_RECOVERY =
  "Nothing was changed. Run a fresh preview with --plan-out, review it, and obtain approval again.";

/** Rechecks a saved plan and, with `--apply`, executes it. Never accepts new selection flags. */
export function applySavedPlan(io: Io, input: ApplySavedPlanInput): ApplySavedPlanOutput {
  const { planFile, opts, hooks } = input;
  if (
    (opts.targets?.length ?? 0) > 0 ||
    (opts.exclude?.length ?? 0) > 0 ||
    opts.gitPull ||
    opts.gitPush ||
    opts.removeStale ||
    opts.planOut
  ) {
    throw syncError(
      "PLAN_INVALID",
      "apply takes only a plan file; selection, Git, and --plan-out options belong to the preview that created it.",
      null,
      "Create a new plan with a preview if the scope must change.",
    );
  }
  const plan = readPlanFile(io, planFile);
  const stale = verifyPlan(io, plan);
  if (stale.length > 0) {
    return {
      kind: "rejected",
      result: gitStoppedResult(plan, stale, STALE_RECOVERY),
      plan,
    };
  }
  const git: GitReport | undefined = plan.git
    ? { remoteRef: plan.git.remoteRef, remoteCommit: plan.git.remoteCommit }
    : undefined;
  if (opts.apply !== true) {
    if (plan.git) {
      const checked = io.git.revalidate(plan.repository.path, plan.git);
      if (!checked.ok) {
        const stopped = gitStoppedResult(
          plan,
          [{ code: checked.code, item: null, message: checked.reason }],
          STALE_RECOVERY,
          git,
        );
        return { kind: "git-stopped", phase: "preview", result: stopped, plan };
      }
    }
    const result = previewResult(plan);
    result.recovery = "The plan is current. Run `sync apply <plan-file> --apply` after approval.";
    if (git) result.git = git;
    return {
      kind: "preview",
      result,
      plan,
      notes: ["plan is current; nothing changed", ...gitNotes(git)],
    };
  }
  const extraLines: string[] = [];
  if (plan.git) {
    // The pull revalidates remote and local state itself and runs before any dependent restore.
    const pulled = io.git.pullChecked(plan.repository.path, plan.git);
    if (!pulled.success) {
      const stopped = gitStoppedResult(
        plan,
        [{ code: pulled.code, item: null, message: pulled.reason }],
        STALE_RECOVERY,
        git,
      );
      return { kind: "git-stopped", phase: "apply", result: stopped, plan };
    }
    extraLines.push(`git_pull  ✔ ${pulled.output || "up to date"}`);
  }
  const result = executePlan(io, plan, hooks);
  if (git) result.git = git;
  return { kind: "applied", result, plan, extraLines };
}

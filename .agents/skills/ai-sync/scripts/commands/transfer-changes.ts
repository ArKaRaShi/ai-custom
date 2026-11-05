import * as path from "node:path";
import type { Io } from "@/scripts/io/io";
import { pushManifestOf } from "@/scripts/lib/manifest-diff";
import {
  type GitPlan,
  type GitReport,
  type Plan,
  type Result,
  type ResultError,
  SyncError,
  syncError,
} from "@/scripts/lib/plan";
import { buildTransferPlan, saveGuardedPlan } from "@/scripts/lib/plan-builder";
import { executePlan } from "@/scripts/lib/plan-executor";
import {
  assertReviewedScope,
  dependentIncoming,
  dependentPlanError,
  gitNotes,
  gitStoppedResult,
  previewResult,
  pullGitPlan,
  pullGitReport,
  TRANSFER_WORDS,
} from "@/scripts/lib/plan-rules";
import { loadRoots } from "@/scripts/lib/root-scanner";
import type { SyncOptions } from "@/scripts/lib/targets";

const MANIFEST_BLOCK_RECOVERY =
  "A push never exports .ai-sync/manifest.json. `sync retire ... --git-push` exports it with the retirements it makes; any other manifest change must be committed by the user before the push.";

export interface TransferChangesInput {
  operation: "push" | "pull";
  repoBase: string;
  opts: SyncOptions;
}

/** What a transfer produced; `result` is the JSON envelope, the rest drives the tree renderers. */
export type TransferChangesOutput =
  | {
      kind: "git-stopped";
      phase: "preview" | "apply";
      result: Result;
      plan: Plan;
    }
  | {
      kind: "preview";
      result: Result;
      plan: Plan;
      /** Resolved path of the saved plan file, when `--plan-out` was given. */
      planFile?: string;
      /** Git notes shown above the file list. */
      notes: string[];
    }
  | {
      kind: "applied";
      result: Result;
      plan: Plan;
      /** Extra tree lines (e.g. the Git push outcome) shown after the file list. */
      extraLines: string[];
    };

/** Pull Git review: either a `GitPlan` that can be saved and applied, or the error that blocks apply. */
type PullGitReview = { git: GitReport; dependent: string[] } & (
  | { plan: GitPlan; blocked: null }
  | { plan: null; blocked: ResultError }
);

/** Previews, saves, or applies a push (local to backup) or pull (backup to local), with its Git steps. */
export function transferChanges(io: Io, input: TransferChangesInput): TransferChangesOutput {
  const { git, reporter } = io;
  const { operation, repoBase, opts } = input;
  const apply = opts.apply === true;
  if (apply && opts.planOut) {
    throw syncError(
      "PLAN_INVALID",
      "--plan-out saves a preview; it cannot be combined with --apply.",
      null,
      "Remove --apply to save the plan, then run `sync apply <plan-file> --apply`.",
    );
  }
  if (operation === "push" && opts.gitPush === true && opts.planOut) {
    throw syncError(
      "PLAN_INVALID",
      "A saved push plan cannot carry a Git commit and push.",
      null,
      "Save the plan without --git-push, or use --git-push on a direct push apply.",
    );
  }
  if (operation === "pull" && opts.removeStale === true) {
    throw syncError(
      "PLAN_INVALID",
      "--remove-stale removes stale backup files, so it applies to push only.",
      null,
      "Rerun the pull without --remove-stale.",
    );
  }
  if (apply) assertReviewedScope(opts);

  const extraLines: string[] = [];
  const pullGit = operation === "pull" && opts.gitPull ? reviewPullGit(io, repoBase) : null;
  if (pullGit && apply) {
    if (pullGit.blocked) {
      throw new SyncError(
        [pullGit.blocked],
        "Resolve the Git state, then preview again; no files were restored.",
      );
    }
    const pulled = git.pullChecked(repoBase, pullGit.plan);
    if (!pulled.success) {
      throw syncError(
        pulled.code,
        `git pull failed: ${pulled.reason}`,
        null,
        "Resolve the Git failure, then preview again; no files were restored.",
      );
    }
    if (opts.format !== "json") {
      reporter.info("ai-sync:pull [git-remote]");
      reporter.info(`  └─ git_pull   ✔ ${pulled.output || "up to date"}`);
    }
  }

  const plan = buildTransferPlan(io, operation, repoBase, opts);
  // A preview with Git changes to explain is not an empty scope: the pull may bring the files, or be blocked.
  const gitExplainsEmpty =
    !apply &&
    !opts.planOut &&
    pullGit !== null &&
    (pullGit.blocked !== null || (pullGit.git.incoming?.length ?? 0) > 0);
  if (
    plan.actions.length === 0 &&
    !gitExplainsEmpty &&
    ((opts.targets?.length ?? 0) > 0 || apply || opts.planOut)
  ) {
    throw syncError(
      "EMPTY_SCOPE",
      `The selection resolved to no files to ${TRANSFER_WORDS[operation].noun}.`,
      null,
      "Check the target with `sync status`, or choose a target that has differences.",
    );
  }

  // Push reports its Git scope for --git-push, and for an applied push whose commit may be offered afterwards.
  const wantsPushScope =
    operation === "push" && (opts.gitPush === true || (apply && opts.gitPush === undefined));
  const pushScope = wantsPushScope
    ? git.previewPush(
        repoBase,
        plan.actions
          .filter((action) => action.type !== "skip")
          .map((action) => action.target.location),
      )
    : null;
  const pushManifest = pushScope ? pushManifestOf(io, repoBase, pushScope) : undefined;
  let gitReport: GitReport | undefined = pullGit?.git;
  if (!gitReport && pushScope) {
    gitReport = pushManifest ? { ...pushScope, manifestDiff: pushManifest.diff } : pushScope;
  }
  let blocked: ResultError | null = pullGit?.blocked ?? null;
  if (operation === "push" && opts.gitPush === true) {
    if (!pushScope) {
      blocked = { code: "GIT_FAILED", item: null, message: `Not a git repository: ${repoBase}` };
    } else if (pushScope.unrelatedChanges.length > 0) {
      const manifestCause = pushManifest?.blocking
        ? `. The manifest ${pushManifest.gitPath} has pending changes that a push does not export`
        : "";
      blocked = {
        code: "GIT_DIRTY_UNRELATED",
        item: null,
        message: `Unrelated changes in the backup repository block --git-push: ${pushScope.unrelatedChanges.join(", ")}${manifestCause}`,
      };
    }
  }
  const manifestRecovery = pushManifest?.blocking ? ` ${MANIFEST_BLOCK_RECOVERY}` : "";
  if (blocked) gitReport = gitReport ?? {};

  if (!apply) {
    if (blocked) {
      const stopped = gitStoppedResult(
        plan,
        [blocked],
        `Resolve the Git state, then preview again. Nothing was changed.${manifestRecovery}`,
        gitReport,
      );
      return { kind: "git-stopped", phase: "preview", result: stopped, plan };
    }
    if (pullGit?.plan && opts.planOut) {
      if (pullGit.dependent.length > 0) throw dependentPlanError(pullGit.dependent);
      plan.git = pullGit.plan;
    }
    const planFile = opts.planOut ? saveGuardedPlan(io, plan, opts.planOut) : undefined;
    const result = previewResult(plan);
    if (gitReport) result.git = gitReport;
    return { kind: "preview", result, plan, planFile, notes: gitNotes(gitReport) };
  }

  if (blocked) {
    const stopped = gitStoppedResult(
      plan,
      [blocked],
      `Resolve the Git state, then run the push again. Nothing was exported.${manifestRecovery}`,
      gitReport,
    );
    return { kind: "git-stopped", phase: "apply", result: stopped, plan };
  }

  const result = executePlan(io, plan);
  if (gitReport) result.git = gitReport;
  if (pushScope && opts.gitPush === true && result.outcome === "success") {
    const pushed = git.commitAndPush(repoBase, pushScope.exportedPaths, opts.commitMessage);
    if (pushed.success) extraLines.push(`🌐 git_push  ✔ ${pushed.output || "up to date"}`);
    else {
      result.outcome = "partial";
      result.errors.push({
        code: pushed.code,
        item: null,
        message: `git push failed: ${pushed.output}`,
      });
      result.recovery =
        "Files were exported. Resolve the Git failure, then repeat the commit and push.";
    }
  }
  return { kind: "applied", result, plan, extraLines };
}

/** Read-only: simulates the remote integration in a temporary repository and never changes Git state. */
function reviewPullGit(io: Io, repoBase: string): PullGitReview {
  const { fileSystem, git } = io;
  if (!fileSystem.exists(path.join(repoBase, ".git"))) {
    return {
      git: {},
      dependent: [],
      plan: null,
      blocked: { code: "GIT_FAILED", item: null, message: `Not a git repository: ${repoBase}` },
    };
  }
  const preview = git.previewRemoteIntegration(repoBase);
  let pending: string[] = [];
  try {
    pending = git.inspectLocalState(repoBase).unrelatedChanges;
  } catch {
    pending = [];
  }
  const dependent = preview.blocked
    ? []
    : dependentIncoming(
        (git.repoPrefix(repoBase) ?? "").trim(),
        repoBase,
        loadRoots(io, repoBase).roots.map((root) => root.repo),
        preview.incoming,
      );
  const report = pullGitReport(preview, pending, dependent);
  if (preview.blocked) {
    return {
      git: report,
      dependent,
      plan: null,
      blocked: { code: preview.blocked.code, item: null, message: preview.blocked.reason },
    };
  }
  return { git: report, dependent, plan: pullGitPlan(preview, pending), blocked: null };
}

import * as path from "node:path";
import type { FileSystem } from "@/scripts/application/interfaces/file-system";
import type { GitGateway } from "@/scripts/application/interfaces/git-gateway";
import type { Reporter } from "@/scripts/application/interfaces/reporter";
import type { PlanBuilder } from "@/scripts/application/services/plan-builder";
import type { PlanExecutor } from "@/scripts/application/services/plan-executor";
import type { RootScanner } from "@/scripts/application/services/root-scanner";
import {
  type GitPlan,
  type GitReport,
  type Plan,
  type Result,
  type ResultError,
  SyncError,
  syncError,
} from "@/scripts/domain/plan";
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
} from "@/scripts/domain/plan-rules";
import type { SyncOptions } from "@/scripts/domain/targets";

export interface TransferChangesDeps {
  fileSystem: FileSystem;
  gitGateway: GitGateway;
  planBuilder: PlanBuilder;
  planExecutor: PlanExecutor;
  reporter: Reporter;
  rootScanner: RootScanner;
}

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
export class TransferChanges {
  constructor(private readonly deps: TransferChangesDeps) {}

  execute(input: TransferChangesInput): TransferChangesOutput {
    const { gitGateway, planBuilder, planExecutor, reporter } = this.deps;
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
    if (apply) assertReviewedScope(opts);

    const extraLines: string[] = [];
    const pullGit = operation === "pull" && opts.gitPull ? this.reviewPullGit(repoBase) : null;
    if (pullGit && apply) {
      if (pullGit.blocked) {
        throw new SyncError(
          [pullGit.blocked],
          "Resolve the Git state, then preview again; no files were restored.",
        );
      }
      const pulled = gitGateway.pullChecked(repoBase, pullGit.plan);
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

    const plan = planBuilder.buildTransferPlan(operation, repoBase, opts);
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
      ? gitGateway.previewPush(
          repoBase,
          plan.actions
            .filter((action) => action.type === "copy" || action.type === "overwrite")
            .map((action) => action.target.location),
        )
      : null;
    let gitReport: GitReport | undefined = pullGit?.git ?? pushScope ?? undefined;
    let blocked: ResultError | null = pullGit?.blocked ?? null;
    if (operation === "push" && opts.gitPush === true) {
      if (!pushScope) {
        blocked = { code: "GIT_FAILED", item: null, message: `Not a git repository: ${repoBase}` };
      } else if (pushScope.unrelatedChanges.length > 0) {
        blocked = {
          code: "GIT_DIRTY_UNRELATED",
          item: null,
          message: `Unrelated changes in the backup repository block --git-push: ${pushScope.unrelatedChanges.join(", ")}`,
        };
      }
    }
    if (blocked) gitReport = gitReport ?? {};

    if (!apply) {
      if (blocked) {
        const stopped = gitStoppedResult(
          plan,
          [blocked],
          "Resolve the Git state, then preview again. Nothing was changed.",
          gitReport,
        );
        return { kind: "git-stopped", phase: "preview", result: stopped, plan };
      }
      if (pullGit?.plan && opts.planOut) {
        if (pullGit.dependent.length > 0) throw dependentPlanError(pullGit.dependent);
        plan.git = pullGit.plan;
      }
      const planFile = opts.planOut ? planBuilder.savePlan(plan, opts.planOut) : undefined;
      const result = previewResult(plan);
      if (gitReport) result.git = gitReport;
      return { kind: "preview", result, plan, planFile, notes: gitNotes(gitReport) };
    }

    if (blocked) {
      const stopped = gitStoppedResult(
        plan,
        [blocked],
        "Resolve the Git state, then run the push again. Nothing was exported.",
        gitReport,
      );
      return { kind: "git-stopped", phase: "apply", result: stopped, plan };
    }

    const result = planExecutor.executePlan(plan);
    if (gitReport) result.git = gitReport;
    if (pushScope && opts.gitPush === true && result.outcome === "success") {
      const pushed = gitGateway.commitAndPush(
        repoBase,
        pushScope.exportedPaths,
        opts.commitMessage,
      );
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
  private reviewPullGit(repoBase: string): PullGitReview {
    const { fileSystem, gitGateway, rootScanner } = this.deps;
    if (!fileSystem.exists(path.join(repoBase, ".git"))) {
      return {
        git: {},
        dependent: [],
        plan: null,
        blocked: { code: "GIT_FAILED", item: null, message: `Not a git repository: ${repoBase}` },
      };
    }
    const preview = gitGateway.previewRemoteIntegration(repoBase);
    let pending: string[] = [];
    try {
      pending = gitGateway.inspectLocalState(repoBase).unrelatedChanges;
    } catch {
      pending = [];
    }
    const dependent = preview.blocked
      ? []
      : dependentIncoming(
          (gitGateway.repoPrefix(repoBase) ?? "").trim(),
          repoBase,
          rootScanner.loadRoots(repoBase).roots.map((root) => root.repo),
          preview.incoming,
        );
    const git = pullGitReport(preview, pending, dependent);
    if (preview.blocked) {
      return {
        git,
        dependent,
        plan: null,
        blocked: { code: preview.blocked.code, item: null, message: preview.blocked.reason },
      };
    }
    return { git, dependent, plan: pullGitPlan(preview, pending), blocked: null };
  }
}

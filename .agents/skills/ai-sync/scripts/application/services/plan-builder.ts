import * as path from "node:path";
import type { FileSystem } from "@/scripts/application/interfaces/file-system";
import type { GitGateway } from "@/scripts/application/interfaces/git-gateway";
import type { PlanStore } from "@/scripts/application/services/plan-store";
import type { RootScanner } from "@/scripts/application/services/root-scanner";
import type { TargetMatcher } from "@/scripts/application/services/target-matcher";
import { isWithin } from "@/scripts/domain/manifest";
import {
  type Plan,
  type PlanAction,
  type ResultError,
  SyncError,
  syncError,
} from "@/scripts/domain/plan";
import {
  assemblePlan,
  boundaryOf,
  checkedSides,
  directoryParts,
  ESCAPE_RECOVERY,
  escapeError,
  type PlanSide,
  pruneActionType,
  transferActionType,
} from "@/scripts/domain/plan-rules";
import {
  bindingsHashOf,
  type EntryState,
  type PruneScan,
  policyHashOf,
  type ScanResult,
  selectCopies,
  selectEntries,
  unknownTargetError,
} from "@/scripts/domain/scan";
import type { SyncOptions } from "@/scripts/domain/targets";

export interface PlanBuilderDeps {
  fileSystem: FileSystem;
  gitGateway: GitGateway;
  planStore: PlanStore;
  rootScanner: RootScanner;
  targetMatcher: TargetMatcher;
}

/** Turns a scan and an explicit selection into a reviewable change plan. Read-only except `savePlan`. */
export class PlanBuilder {
  constructor(private readonly deps: PlanBuilderDeps) {}

  /** Snapshot the selected scope, policy, bindings, and source and target fingerprints. Read-only. */
  buildTransferPlan(operation: "push" | "pull", repoBase: string, opts: SyncOptions = {}): Plan {
    const { rootScanner, gitGateway } = this.deps;
    const scanned = rootScanner.scanTargets(repoBase, opts);
    const targets = (opts.targets ?? []).map((target) => target.trim());
    const actions = this.computeActions(operation, scanned, targets);
    return assemblePlan({
      operation,
      repoBase,
      headCommit: gitGateway.headCommit(repoBase),
      targets,
      exclude: opts.exclude ?? [],
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
  buildPrunePlan(repoBase: string, opts: SyncOptions = {}): Plan {
    const { rootScanner, gitGateway } = this.deps;
    const scanned = rootScanner.scanExcludedCopies(repoBase, opts);
    const targets = (opts.targets ?? []).map((target) => target.trim());
    const actions = this.computePruneActions(scanned, targets);
    return assemblePlan({
      operation: "prune",
      repoBase,
      headCommit: gitGateway.headCommit(repoBase),
      targets,
      exclude: opts.exclude ?? [],
      actions,
      policyHash: policyHashOf(scanned.manifest),
      bindingsHash: bindingsHashOf(scanned.roots),
    });
  }

  computeActions(operation: "push" | "pull", scanned: ScanResult, targets: string[]): PlanAction[] {
    const { fileSystem, targetMatcher } = this.deps;
    const { selected, unknown } = selectEntries(scanned, targets, (raw, candidate) =>
      targetMatcher.matchesTarget(raw, candidate),
    );
    if (unknown.length > 0) throw unknownTargetError(unknown);
    const wanted: EntryState[] =
      operation === "push" ? ["new_local", "modified"] : ["new_repo", "modified"];
    const actions = selected
      .filter((entry) => wanted.includes(entry.state))
      .map((entry, index): PlanAction => {
        const from = operation === "push" ? entry.local : entry.repo;
        const to = operation === "push" ? entry.repo : entry.local;
        const source = { location: from, digest: fileSystem.digest(from) };
        const target = { location: to, digest: fileSystem.digest(to) };
        return {
          id: `a${index + 1}`,
          type: transferActionType(source.digest, target.digest),
          root: entry.root,
          path: entry.path,
          source,
          target,
        };
      });
    const escaped = this.escapeErrors(actions);
    if (escaped.length > 0) throw new SyncError(escaped, ESCAPE_RECOVERY);
    return actions;
  }

  computePruneActions(scanned: PruneScan, targets: string[]): PlanAction[] {
    const { fileSystem, targetMatcher } = this.deps;
    const { selected, unknown } = selectCopies(scanned, targets, (raw, candidate) =>
      targetMatcher.matchesTarget(raw, candidate),
    );
    if (unknown.length > 0) throw unknownTargetError(unknown);
    const actions = selected.map((copy, index): PlanAction => {
      const target = { location: copy.repo, digest: fileSystem.digest(copy.repo) };
      return {
        id: `a${index + 1}`,
        type: pruneActionType(target.digest),
        root: copy.root,
        path: copy.path,
        source: { location: copy.local, digest: fileSystem.digest(copy.local) },
        target,
      };
    });
    const escaped = this.escapeErrors(actions, checkedSides("prune"));
    if (escaped.length > 0) throw new SyncError(escaped, ESCAPE_RECOVERY);
    return actions;
  }

  /**
   * True when a directory component of `relPath` beneath `base` is a symlink that resolves
   * outside `base` or to nothing. Symlinked directories that stay inside the root are allowed.
   * The final component is not followed here: a symlinked file is reported as a skipped action.
   * Components that do not exist yet cannot redirect a write, so the walk stops at the first one.
   */
  pathEscapesRoot(base: string, relPath: string): boolean {
    const { fileSystem } = this.deps;
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
  escapeErrors(
    actions: PlanAction[],
    checked: readonly PlanSide[] = ["source", "target"],
  ): ResultError[] {
    const errors: ResultError[] = [];
    for (const action of actions) {
      const sides = checked.filter((side) =>
        this.pathEscapesRoot(boundaryOf(action[side].location, action.path), action.path),
      );
      if (sides.length > 0) errors.push(escapeError(action, sides));
    }
    return errors;
  }

  /** A plan file is an output artifact: it must not land inside the backup or a managed root. */
  savePlan(plan: Plan, file: string): string {
    const { planStore, rootScanner } = this.deps;
    const guarded = [
      plan.repository.path,
      ...rootScanner.loadRoots(plan.repository.path).roots.map((root) => root.local),
    ];
    return planStore.savePlan(plan, file, guarded);
  }
}

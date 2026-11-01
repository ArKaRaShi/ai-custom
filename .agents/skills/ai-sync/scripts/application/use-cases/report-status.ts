import type { Environment } from "@/scripts/application/interfaces/environment";
import type { RootScanner } from "@/scripts/application/services/root-scanner";
import type { TargetMatcher } from "@/scripts/application/services/target-matcher";
import { countByState, statusResultOf } from "@/scripts/domain/diff";
import type { Result } from "@/scripts/domain/plan";
import { type EntryState, selectEntries, unknownTargetError } from "@/scripts/domain/scan";
import type { SyncOptions } from "@/scripts/domain/targets";

export interface ReportStatusDeps {
  rootScanner: RootScanner;
  targetMatcher: TargetMatcher;
  environment: Environment;
}

export interface ReportStatusInput {
  repoBase: string;
  opts: SyncOptions;
}

export interface ReportStatusOutput {
  home: string;
  repoBase: string;
  /** Each sync root with its machine-local path. */
  roots: { id: string; local: string }[];
  /** Explicit targets the report was narrowed to; empty when it covers everything. */
  targets: string[];
  counts: Record<EntryState, number>;
  /** True when any selected file is not in sync. */
  drifting: boolean;
  result: Result;
}

/** Drift summary of every sync root against the backup repository. Read-only. */
export class ReportStatus {
  constructor(private readonly deps: ReportStatusDeps) {}

  execute(input: ReportStatusInput): ReportStatusOutput {
    const { rootScanner, targetMatcher, environment } = this.deps;
    const { repoBase, opts } = input;
    const scanned = rootScanner.scanTargets(repoBase, opts);
    const targets = opts.targets ?? [];
    const { selected, unknown } = selectEntries(scanned, targets, (raw, candidate) =>
      targetMatcher.matchesTarget(raw, candidate),
    );
    if (unknown.length > 0) throw unknownTargetError(unknown);
    const result = statusResultOf(selected);
    return {
      home: environment.home,
      repoBase,
      roots: scanned.roots.map((root) => ({ id: root.id, local: root.local })),
      targets,
      counts: {
        in_sync: countByState(selected, "in_sync"),
        new_local: countByState(selected, "new_local"),
        new_repo: countByState(selected, "new_repo"),
        modified: countByState(selected, "modified"),
      },
      drifting: selected.some((entry) => entry.state !== "in_sync"),
      result,
    };
  }
}

import type { Io } from "@/scripts/io/io";
import { countByState, statusResultOf } from "@/scripts/lib/diff";
import { driftFilesOf, selectDrift } from "@/scripts/lib/drift";
import type { DriftFile, Result } from "@/scripts/lib/plan";
import { loadRoots, scanExcludedCopies, scanTargets } from "@/scripts/lib/root-scanner";
import { type EntryState, unknownTargetError } from "@/scripts/lib/scan";
import type { SyncOptions } from "@/scripts/lib/targets";

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
  /** Policy-excluded backup copies in scope. They are listed in `drift` but are not drift to transfer. */
  excludedCopies: number;
  /** Each file that is not in sync, and each excluded backup copy, with its cause. */
  drift: DriftFile[];
  /** True when any selected file is not in sync. */
  drifting: boolean;
  result: Result;
}

/** Drift summary of every sync root against the backup repository, with a cause per file. Read-only. */
export function reportStatus(io: Io, input: ReportStatusInput): ReportStatusOutput {
  const { environment } = io;
  const { repoBase, opts } = input;
  const loaded = loadRoots(io, repoBase);
  const scanned = scanTargets(io, repoBase, opts, loaded);
  const pruned = scanExcludedCopies(io, repoBase, opts, loaded);
  const targets = opts.targets ?? [];
  const { entries: selected, copies, unknown } = selectDrift(io, scanned, pruned, targets);
  if (unknown.length > 0) throw unknownTargetError(unknown);
  const drift = driftFilesOf(io, loaded.manifest, selected, copies);
  const result: Result = { ...statusResultOf(selected), drift };
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
    excludedCopies: copies.length,
    drift,
    drifting: selected.some((entry) => entry.state !== "in_sync"),
    result,
  };
}

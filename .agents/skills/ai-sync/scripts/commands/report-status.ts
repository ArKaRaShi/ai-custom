import type { Io } from "@/scripts/io/io";
import { countByState, statusResultOf } from "@/scripts/lib/diff";
import type { Result } from "@/scripts/lib/plan";
import { scanTargets } from "@/scripts/lib/root-scanner";
import { type EntryState, selectEntries, unknownTargetError } from "@/scripts/lib/scan";
import { matchesTarget } from "@/scripts/lib/target-matcher";
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
  /** True when any selected file is not in sync. */
  drifting: boolean;
  result: Result;
}

/** Drift summary of every sync root against the backup repository. Read-only. */
export function reportStatus(io: Io, input: ReportStatusInput): ReportStatusOutput {
  const { environment } = io;
  const { repoBase, opts } = input;
  const scanned = scanTargets(io, repoBase, opts);
  const targets = opts.targets ?? [];
  const { selected, unknown } = selectEntries(scanned, targets, (raw, candidate) =>
    matchesTarget(io, raw, candidate),
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

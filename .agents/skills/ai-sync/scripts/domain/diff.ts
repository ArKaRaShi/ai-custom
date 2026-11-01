import * as path from "node:path";
import type { Result } from "@/scripts/domain/plan";
import {
  type DiffReport,
  type EntryState,
  entryIdentity,
  type ResolvedSyncTarget,
  type ScanEntry,
  type ScanResult,
  selectEntries,
  unknownTargetError,
} from "@/scripts/domain/scan";
import type { TargetTest } from "@/scripts/domain/targets";

/** The sync target whose `side` tree contains `value`, with the path relative to that tree. */
export function targetForPath(
  targets: ResolvedSyncTarget[],
  value: string,
  side: "local" | "repo",
): { target: ResolvedSyncTarget; relative: string } | undefined {
  for (const target of targets) {
    const base = target[side];
    const relative = path.relative(base, value);
    if (
      relative !== "" &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
    ) {
      return { target, relative };
    }
  }
  return undefined;
}

/** Buckets scan entries by drift state. `modified` lists local paths, `missingInLocal` backup paths. */
export function diffReportOf(selected: ScanEntry[]): DiffReport {
  const report: DiffReport = { missingInRepo: [], missingInLocal: [], modified: [], inSync: 0 };
  for (const entry of selected) {
    if (entry.state === "in_sync") report.inSync++;
    else if (entry.state === "modified") report.modified.push(entry.local);
    else if (entry.state === "new_local") report.missingInRepo.push(entry.local);
    else report.missingInLocal.push(entry.repo);
  }
  return report;
}

/** Drift report for the scan narrowed by explicit targets; throws UNKNOWN_TARGET for unmatched targets. */
export function compareScan(
  scanned: ScanResult,
  targets: string[],
  matchesTarget: TargetTest,
): DiffReport {
  const { selected, unknown } = selectEntries(scanned, targets, matchesTarget);
  if (unknown.length > 0) throw unknownTargetError(unknown);
  return diffReportOf(selected);
}

/** A file present on both sides with different content. */
export interface DivergentFile {
  /** Path relative to the sync target's tree. */
  relative: string;
  local: string;
  repo: string;
}

/** Pairs each modified local file with its backup counterpart; files outside every target are skipped. */
export function divergentFiles(
  report: DiffReport,
  syncTargets: ResolvedSyncTarget[],
): DivergentFile[] {
  const files: DivergentFile[] = [];
  for (const local of report.modified) {
    const pair = targetForPath(syncTargets, local, "local");
    if (!pair) continue;
    files.push({
      relative: pair.relative,
      local,
      repo: path.join(pair.target.repo, pair.relative),
    });
  }
  return files;
}

export function countByState(entries: ScanEntry[], state: EntryState): number {
  return entries.filter((entry) => entry.state === state).length;
}

/** The `status` envelope: entries that are not in sync count as drift. */
export function statusResultOf(selected: ScanEntry[]): Result {
  const drifting = selected.filter((entry) => entry.state !== "in_sync");
  return {
    operation: "status",
    scope: {
      roots: [...new Set(drifting.map((entry) => entry.root))].sort(),
      resolvedPaths: drifting.map(entryIdentity),
    },
    actions: [],
    outcome: "success",
    errors: [],
    recovery: drifting.length > 0 ? "Run push or pull to preview the transfer." : null,
  };
}

import type { Io } from "@/scripts/io/io";
import { compareScan } from "@/scripts/lib/diff";
import { scanTargets } from "@/scripts/lib/root-scanner";
import type { DiffReport } from "@/scripts/lib/scan";
import { matchesTarget } from "@/scripts/lib/target-matcher";
import type { SyncOptions } from "@/scripts/lib/targets";

export interface CompareTreesInput {
  repoBase: string;
  opts: SyncOptions;
}

export type CompareTreesOutput = DiffReport;

/** Buckets every selected managed file by drift state between this machine and the backup. Read-only. */
export function compareTrees(io: Io, input: CompareTreesInput): CompareTreesOutput {
  const { repoBase, opts } = input;
  const scanned = scanTargets(io, repoBase, opts);
  return compareScan(scanned, opts.targets ?? [], (raw, candidate) =>
    matchesTarget(io, raw, candidate),
  );
}

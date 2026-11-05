import type { Io } from "@/scripts/io/io";
import { compareScan, type DivergentFile, divergentFiles } from "@/scripts/lib/diff";
import { getSyncTargets, scanTargets } from "@/scripts/lib/root-scanner";
import { matchesTarget } from "@/scripts/lib/target-matcher";
import type { SyncOptions } from "@/scripts/lib/targets";

export interface ViewDiffInput {
  repoBase: string;
  opts: SyncOptions;
}

export interface ViewDiffOutput {
  /** Number of files whose content differs, including ones outside every sync target. */
  divergent: number;
  files: (DivergentFile & { diff: string })[];
}

/** Unified diff of every modified file between this machine and the backup. Read-only. */
export function viewDiff(io: Io, input: ViewDiffInput): ViewDiffOutput {
  const { commandRunner, reporter } = io;
  const { repoBase, opts } = input;
  reporter.info(`\n🔍 Inspecting diffs between local machine and ${repoBase}...\n`);
  const scanned = scanTargets(io, repoBase, opts);
  const report = compareScan(scanned, opts.targets ?? [], (raw, candidate) =>
    matchesTarget(io, raw, candidate),
  );
  const files = divergentFiles(report, getSyncTargets(io, repoBase, scanned)).map((file) => ({
    ...file,
    diff: commandRunner.diff(file.local, file.repo),
  }));
  return { divergent: report.modified.length, files };
}

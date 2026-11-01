import type { CommandRunner } from "@/scripts/application/interfaces/command-runner";
import type { Reporter } from "@/scripts/application/interfaces/reporter";
import type { RootScanner } from "@/scripts/application/services/root-scanner";
import type { TargetMatcher } from "@/scripts/application/services/target-matcher";
import { compareScan, type DivergentFile, divergentFiles } from "@/scripts/domain/diff";
import type { SyncOptions } from "@/scripts/domain/targets";

export interface ViewDiffDeps {
  rootScanner: RootScanner;
  targetMatcher: TargetMatcher;
  commandRunner: CommandRunner;
  reporter: Reporter;
}

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
export class ViewDiff {
  constructor(private readonly deps: ViewDiffDeps) {}

  execute(input: ViewDiffInput): ViewDiffOutput {
    const { rootScanner, targetMatcher, commandRunner, reporter } = this.deps;
    const { repoBase, opts } = input;
    reporter.info(`\n🔍 Inspecting diffs between local machine and ${repoBase}...\n`);
    const scanned = rootScanner.scanTargets(repoBase, opts);
    const report = compareScan(scanned, opts.targets ?? [], (raw, candidate) =>
      targetMatcher.matchesTarget(raw, candidate),
    );
    const files = divergentFiles(report, rootScanner.getSyncTargets(repoBase, scanned)).map(
      (file) => ({ ...file, diff: commandRunner.diff(file.local, file.repo) }),
    );
    return { divergent: report.modified.length, files };
  }
}

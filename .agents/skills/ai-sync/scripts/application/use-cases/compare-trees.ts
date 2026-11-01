import type { RootScanner } from "@/scripts/application/services/root-scanner";
import type { TargetMatcher } from "@/scripts/application/services/target-matcher";
import { compareScan } from "@/scripts/domain/diff";
import type { DiffReport } from "@/scripts/domain/scan";
import type { SyncOptions } from "@/scripts/domain/targets";

export interface CompareTreesDeps {
  rootScanner: RootScanner;
  targetMatcher: TargetMatcher;
}

export interface CompareTreesInput {
  repoBase: string;
  opts: SyncOptions;
}

export type CompareTreesOutput = DiffReport;

/** Buckets every selected managed file by drift state between this machine and the backup. Read-only. */
export class CompareTrees {
  constructor(private readonly deps: CompareTreesDeps) {}

  execute(input: CompareTreesInput): CompareTreesOutput {
    const { rootScanner, targetMatcher } = this.deps;
    const { repoBase, opts } = input;
    const scanned = rootScanner.scanTargets(repoBase, opts);
    return compareScan(scanned, opts.targets ?? [], (raw, candidate) =>
      targetMatcher.matchesTarget(raw, candidate),
    );
  }
}

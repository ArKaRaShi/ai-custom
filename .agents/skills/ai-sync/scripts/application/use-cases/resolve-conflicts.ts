import type { CommandRunner, MergeResult } from "@/scripts/application/interfaces/command-runner";
import type { Environment } from "@/scripts/application/interfaces/environment";
import type { FileSystem } from "@/scripts/application/interfaces/file-system";
import type { Prompter } from "@/scripts/application/interfaces/prompter";
import type { Reporter } from "@/scripts/application/interfaces/reporter";
import type { RootScanner } from "@/scripts/application/services/root-scanner";
import type { TargetMatcher } from "@/scripts/application/services/target-matcher";
import { compareScan, divergentFiles } from "@/scripts/domain/diff";
import type { SyncOptions } from "@/scripts/domain/targets";

export type ResolveMode = "interactive" | "merge-all";

export interface ResolveConflictsDeps {
  rootScanner: RootScanner;
  targetMatcher: TargetMatcher;
  fileSystem: FileSystem;
  commandRunner: CommandRunner;
  prompter: Prompter;
  reporter: Reporter;
  environment: Environment;
}

export interface ResolveConflictsInput {
  repoBase: string;
  opts: SyncOptions;
  mode: ResolveMode;
}

export interface ResolveConflictsOutput {
  /** Number of files whose content differs, including ones outside every sync target. */
  divergent: number;
  /** Files the resolution wrote to. */
  resolved: number;
}

/** Reconciles files that differ between this machine (ours) and the backup (theirs). */
export class ResolveConflicts {
  constructor(private readonly deps: ResolveConflictsDeps) {}

  async execute(input: ResolveConflictsInput): Promise<ResolveConflictsOutput> {
    const { rootScanner, targetMatcher, commandRunner, prompter, reporter, environment } =
      this.deps;
    const { repoBase, opts, mode } = input;
    reporter.info("\n🔄 Resolving divergent files between Local (ours) and Repo (theirs)...\n");
    const scanned = rootScanner.scanTargets(repoBase, opts);
    const report = compareScan(scanned, opts.targets ?? [], (raw, candidate) =>
      targetMatcher.matchesTarget(raw, candidate),
    );
    if (report.modified.length === 0) return { divergent: 0, resolved: 0 };

    let resolved = 0;
    for (const file of divergentFiles(report, rootScanner.getSyncTargets(repoBase, scanned))) {
      const { relative, local, repo } = file;
      reporter.info(`Conflict / Divergence: ${relative}`);
      if (mode === "merge-all") {
        const merged = this.mergeBothWays(local, repo);
        reporter.info(
          merged.hasConflicts
            ? "Merged with conflict markers; review before keeping."
            : "Cleanly combined changes from both copies.",
        );
        resolved++;
        continue;
      }
      let choice = "3";
      if (environment.isInteractive) {
        choice = (await prompter.ask("Choice [d/1/2/3/s] (default: 3): ")).trim() || "3";
      }
      if (choice === "d") reporter.info(commandRunner.diff(local, repo));
      else if (choice === "1") {
        this.deps.fileSystem.copyFile(local, repo);
        resolved++;
      } else if (choice === "2") {
        this.deps.fileSystem.copyFile(repo, local);
        resolved++;
      } else if (choice === "3") {
        this.mergeBothWays(local, repo);
        resolved++;
      }
    }
    return { divergent: report.modified.length, resolved };
  }

  private mergeBothWays(local: string, repo: string): MergeResult {
    const merged = this.deps.commandRunner.mergeFiles(local, repo);
    this.deps.fileSystem.writeText(local, merged.content);
    this.deps.fileSystem.writeText(repo, merged.content);
    return merged;
  }
}

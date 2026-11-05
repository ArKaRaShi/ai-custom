import type { MergeResult } from "@/scripts/io/command-runner";
import type { Io } from "@/scripts/io/io";
import { compareScan, divergentFiles } from "@/scripts/lib/diff";
import { getSyncTargets, scanTargets } from "@/scripts/lib/root-scanner";
import { matchesTarget } from "@/scripts/lib/target-matcher";
import type { SyncOptions } from "@/scripts/lib/targets";

export type ResolveMode = "interactive" | "merge-all";

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
export async function resolveConflicts(
  io: Io,
  input: ResolveConflictsInput,
): Promise<ResolveConflictsOutput> {
  const { commandRunner, prompter, reporter, environment } = io;
  const { repoBase, opts, mode } = input;
  reporter.info("\n🔄 Resolving divergent files between Local (ours) and Repo (theirs)...\n");
  const scanned = scanTargets(io, repoBase, opts);
  const report = compareScan(scanned, opts.targets ?? [], (raw, candidate) =>
    matchesTarget(io, raw, candidate),
  );
  if (report.modified.length === 0) return { divergent: 0, resolved: 0 };

  let resolved = 0;
  for (const file of divergentFiles(report, getSyncTargets(io, repoBase, scanned))) {
    const { relative, local, repo } = file;
    reporter.info(`Conflict / Divergence: ${relative}`);
    if (mode === "merge-all") {
      const merged = mergeBothWays(io, local, repo);
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
      io.fileSystem.copyFile(local, repo);
      resolved++;
    } else if (choice === "2") {
      io.fileSystem.copyFile(repo, local);
      resolved++;
    } else if (choice === "3") {
      mergeBothWays(io, local, repo);
      resolved++;
    }
  }
  return { divergent: report.modified.length, resolved };
}

function mergeBothWays(io: Io, local: string, repo: string): MergeResult {
  const merged = io.commandRunner.mergeFiles(local, repo);
  io.fileSystem.writeText(local, merged.content);
  io.fileSystem.writeText(repo, merged.content);
  return merged;
}

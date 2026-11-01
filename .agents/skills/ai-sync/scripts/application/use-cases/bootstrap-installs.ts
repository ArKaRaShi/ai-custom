import type { CommandRunner } from "@/scripts/application/interfaces/command-runner";
import type { FileSystem } from "@/scripts/application/interfaces/file-system";
import type { Reporter } from "@/scripts/application/interfaces/reporter";
import type { ManifestRepository } from "@/scripts/application/services/manifest-repository";
import {
  approvalRejection,
  bootstrapOutcome,
  bootstrapRecovery,
  findPendingInstalls,
  type PendingInstall,
  reviewApprovals,
} from "@/scripts/domain/bootstrap";
import type { Result, ResultError } from "@/scripts/domain/plan";

export interface BootstrapInstallsDeps {
  manifestRepository: ManifestRepository;
  fileSystem: FileSystem;
  commandRunner: CommandRunner;
  /** Receives the per-installer progress line (tree format only). */
  reporter: Reporter;
  /**
   * Runs and renders a pull preview of `repoBase` (tree format only). It runs after every
   * approval is validated and before any installer, as the old bootstrap did. The composition
   * root wires it to the pull use case and its renderer.
   */
  pullPreview: (repoBase: string) => void;
}

export interface BootstrapInstallsInput {
  repoBase: string;
  format?: "tree" | "json";
  /** `<root>:<skill>@<hash>` tokens the user approved. */
  approveInstall?: string[];
}

export interface BootstrapInstallsOutput {
  json: boolean;
  result: Result;
  pending: { id: string; hash: string; command: string }[];
  /** Ids of the pending installers whose approval was accepted. */
  approved: string[];
  /** Skills with no recorded installer or source. */
  manual: string[];
  completed: number;
}

/**
 * Review, and only on explicit approval run, the installers of absent external skills.
 * Installer commands are shell commands from the shared manifest, so none runs unless its
 * `<root>:<skill>@<hash>` token is named with `--approve-install` and the hash still matches
 * the command in the manifest. Every approval is checked before any installer runs.
 */
export class BootstrapInstalls {
  constructor(private readonly deps: BootstrapInstallsDeps) {}

  execute(input: BootstrapInstallsInput): BootstrapInstallsOutput {
    const { manifestRepository, fileSystem, commandRunner, reporter, pullPreview } = this.deps;
    const { repoBase } = input;
    const json = input.format === "json";
    const manifest = manifestRepository.loadUnifiedManifest(repoBase);
    const locations = manifestRepository.loadLocations();
    const roots = manifestRepository.resolveRoots(manifest, locations, repoBase);
    const { pending, manual } = findPendingInstalls(manifest, roots, locations, (file) =>
      fileSystem.exists(file),
    );
    const review = reviewApprovals(pending, input.approveInstall ?? []);
    if (review.rejected.length > 0) throw approvalRejection(review);
    const approved = review.approved;
    if (!json) pullPreview(repoBase);

    const actions: Result["actions"] = [];
    const errors: ResultError[] = [];
    let failure: PendingInstall | undefined;
    for (const [index, install] of pending.entries()) {
      const id = `a${index + 1}`;
      if (approved.size === 0) {
        actions.push({ id, state: "proposed" });
      } else if (!approved.has(install.id) || failure) {
        actions.push({ id, state: "not_attempted" });
      } else {
        try {
          if (!json) reporter.info(`  🌐 Installing '${install.id}' via: ${install.command}`);
          commandRunner.runShell(install.command, { stdio: json ? "pipe" : "inherit" });
          actions.push({ id, state: "completed" });
        } catch (error) {
          failure = install;
          const message = `Installer for ${install.id} failed: ${(error as Error).message.split("\n")[0]}`;
          actions.push({ id, state: "failed", error: message });
          errors.push({ code: "IO_FAILED", item: install.id, message });
        }
      }
    }

    const completed = actions.filter((action) => action.state === "completed").length;
    const outcome = bootstrapOutcome(approved.size, errors.length, completed);
    const result: Result = {
      operation: "bootstrap",
      scope: {
        roots: [...new Set(pending.map((install) => install.item.root))].sort(),
        resolvedPaths: pending.map((install) => install.id),
      },
      actions,
      outcome,
      errors,
      recovery: bootstrapRecovery(failure, approved.size, pending.length, manual),
      items: pending.map((install) => install.item),
    };
    return {
      json,
      result,
      pending: pending.map(({ id, hash, command }) => ({ id, hash, command })),
      approved: [...approved],
      manual,
      completed,
    };
  }
}

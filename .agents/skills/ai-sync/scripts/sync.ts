#!/usr/bin/env bun
import { addRoot } from "@/scripts/commands/add-root";
import { applySavedPlan } from "@/scripts/commands/apply-saved-plan";
import { bindRoot } from "@/scripts/commands/bind-root";
import { bootstrapInstalls } from "@/scripts/commands/bootstrap-installs";
import { discoverCandidates } from "@/scripts/commands/discover-candidates";
import { initRepository } from "@/scripts/commands/init-repository";
import { inspectItems } from "@/scripts/commands/inspect-items";
import { migrateV2 } from "@/scripts/commands/migrate-v2";
import { pruneBackup } from "@/scripts/commands/prune-backup";
import { reportStatus } from "@/scripts/commands/report-status";
import { resolveConflicts } from "@/scripts/commands/resolve-conflicts";
import { retireSkill } from "@/scripts/commands/retire-skill";
import { trackPath } from "@/scripts/commands/track-path";
import { trackSkill } from "@/scripts/commands/track-skill";
import { transferChanges } from "@/scripts/commands/transfer-changes";
import { untrackEntry } from "@/scripts/commands/untrack-entry";
import { viewDiff } from "@/scripts/commands/view-diff";
import { createIo, type Io } from "@/scripts/io/io";
import type { Result } from "@/scripts/lib/plan";
import { renderApplyPlan } from "@/scripts/render/apply-plan";
import { renderBootstrap } from "@/scripts/render/bootstrap";
import { renderViewDiff } from "@/scripts/render/diff";
import { renderDiscover } from "@/scripts/render/discover";
import { canonicalOperation, hasProblem } from "@/scripts/render/exit-policy";
import { renderFailure } from "@/scripts/render/failure";
import { fallbackUsage, usageText } from "@/scripts/render/help";
import { renderInit } from "@/scripts/render/init";
import { renderInspect } from "@/scripts/render/inspect";
import { renderMigrate } from "@/scripts/render/migrate";
import { type ParsedArgs, parseArgs } from "@/scripts/render/parse-args";
import { renderPrune } from "@/scripts/render/prune";
import { renderResolve } from "@/scripts/render/resolve";
import { renderRetire } from "@/scripts/render/retire";
import { renderAddRoot, renderBindRoot } from "@/scripts/render/root";
import { renderStatus } from "@/scripts/render/status";
import { renderTrackPath, renderTrackSkill } from "@/scripts/render/track";
import { renderTransfer } from "@/scripts/render/transfer";
import { renderUntrack } from "@/scripts/render/untrack";

const failOnProblem = (result: Result): void => {
  if (hasProblem(result)) process.exitCode = 1;
};

/** Runs one parsed command. Throws on failure; the caller renders the error. */
async function run(io: Io, parsed: ParsedArgs): Promise<void> {
  const { command, repo, opts, args, meta } = parsed;
  const interactive = process.stdin.isTTY && opts.format !== "json";

  switch (command) {
    case "inspect": {
      const output = inspectItems(io, { repoBase: repo, opts });
      renderInspect(output, opts.format);
      failOnProblem(output.result);
      break;
    }
    case "status":
    case "scan": {
      const output = reportStatus(io, { repoBase: repo, opts });
      renderStatus(output, opts.format);
      failOnProblem(output.result);
      break;
    }
    case "diff":
      renderViewDiff(viewDiff(io, { repoBase: repo, opts }));
      break;
    case "resolve":
    case "review":
      renderResolve(await resolveConflicts(io, { repoBase: repo, opts, mode: "interactive" }));
      break;
    case "merge":
    case "combine":
      renderResolve(await resolveConflicts(io, { repoBase: repo, opts, mode: "merge-all" }));
      break;
    case "pull": {
      if (opts.apply && opts.gitPull === undefined && interactive) {
        const answer = await io.prompter.ask(
          "Pull latest changes from remote git repository first? (y/N): ",
        );
        if (/^(y|yes)$/i.test(answer.trim())) opts.gitPull = true;
      }
      const output = transferChanges(io, {
        operation: "pull",
        repoBase: repo,
        opts,
      });
      renderTransfer(output, opts.format);
      failOnProblem(output.result);
      break;
    }
    case "push":
    case "backup":
    case "save": {
      const output = transferChanges(io, {
        operation: "push",
        repoBase: repo,
        opts,
      });
      renderTransfer(output, opts.format);
      const { result } = output;
      failOnProblem(result);
      if (opts.apply && result.outcome === "success" && opts.gitPush === undefined && interactive) {
        const answer = await io.prompter.ask(
          "Commit and push backup to remote git repository? (y/N): ",
        );
        if (/^(y|yes)$/i.test(answer.trim())) {
          const gitRes = io.git.commitAndPush(
            repo,
            result.git?.exportedPaths ?? [],
            opts.commitMessage,
          );
          console.log(
            gitRes.success
              ? `  🌐 git remote push: ${gitRes.output || "up to date"}`
              : `  ⚠️ git remote push failed: ${gitRes.output}`,
          );
          if (!gitRes.success) process.exitCode = 1;
        }
      }
      break;
    }
    case "prune": {
      const output = pruneBackup(io, { repoBase: repo, opts });
      renderPrune(output, opts.format);
      failOnProblem(output.result);
      break;
    }
    case "apply": {
      const planFile = args[0];
      if (!planFile) throw new Error("Usage: apply <plan-file> [--apply] [--format=json]");
      const output = applySavedPlan(io, { planFile, opts });
      renderApplyPlan(output, opts.format);
      failOnProblem(output.result);
      break;
    }
    case "init":
      renderInit(initRepository(io, { repoBase: repo }));
      break;
    case "root":
      if (args[0] === "add" && args[1] && meta.kind && meta.repoRoot) {
        renderAddRoot(
          addRoot(io, {
            id: args[1],
            kind: meta.kind,
            repoRoot: meta.repoRoot,
            repoBase: repo,
          }),
        );
      } else if (args[0] === "bind" && args[1] && meta.localRoot) {
        renderBindRoot(bindRoot(io, { id: args[1], localRoot: meta.localRoot, repoBase: repo }));
      } else {
        throw new Error(
          "Usage: root add <id> --kind <path|skill> --repo-root <relative-path> | root bind <id> --local-root <absolute-or-~/path>",
        );
      }
      break;
    case "track":
      if (args[0] === "path" && args[1] && meta.root) {
        renderTrackPath(
          trackPath(io, {
            pattern: args[1],
            rootId: meta.root,
            sync: meta.sync ?? true,
            repoBase: repo,
            version: meta.version,
          }),
        );
      } else if (args[0] === "skill" && args[1] && meta.root) {
        renderTrackSkill(
          trackSkill(io, {
            name: meta.entryPath ?? args[1],
            rootId: meta.root,
            metadata: {
              origin: meta.origin,
              source: meta.from,
              sourceType: meta.sourceType,
              install: meta.install,
              version: meta.version,
              description: meta.description,
              sync: meta.sync,
            },
            repoBase: repo,
          }),
        );
      } else {
        throw new Error(
          "Usage: track path <pattern> --root <id> | track skill <name> --root <id> [--origin <authored|external>] (origin is required for a new skill)",
        );
      }
      break;
    case "untrack":
      if ((args[0] === "path" || args[0] === "skill") && args[1] && meta.root) {
        renderUntrack(
          untrackEntry(io, {
            kind: args[0],
            name: args[1],
            rootId: meta.root,
            repoBase: repo,
            prune: meta.prune,
          }),
        );
      } else {
        throw new Error(
          "Usage: untrack path <pattern> --root <id> | untrack skill <name> --root <id> [--prune]",
        );
      }
      break;
    case "retire": {
      const files = opts.targets ?? [];
      if ((args.length === 0 && files.length === 0) || (args.length > 0 && !meta.root))
        throw new Error(
          "Usage: retire <skill...> --root <id> [--target <root>:<path>...] [--apply] [--git-push] [-m <msg>]",
        );
      const output = retireSkill(io, {
        repoBase: repo,
        rootId: meta.root ?? null,
        names: args,
        files,
        opts,
      });
      renderRetire(output, opts.format);
      failOnProblem(output.result);
      break;
    }
    case "migrate-v2":
      renderMigrate(migrateV2(io, { repoBase: repo }));
      break;
    case "bootstrap":
    case "restore": {
      const output = bootstrapInstalls(io, {
        repoBase: repo,
        format: opts.format,
        approveInstall: opts.approveInstall,
        pullPreview: (repoBase: string): void => {
          const preview = transferChanges(io, { operation: "pull", repoBase, opts: {} });
          renderTransfer(preview, undefined);
        },
      });
      renderBootstrap(output);
      failOnProblem(output.result);
      break;
    }
    case "discover":
      renderDiscover(discoverCandidates(io, { repoBase: repo, write: opts.write === true }));
      break;
    default:
      console.log(fallbackUsage);
      process.exit(1);
  }
}

if (import.meta.main) {
  const io = createIo();
  const parsed = parseArgs(process.argv.slice(2), io.environment.defaultRepo, {
    home: io.environment.home,
    pathExists: (candidate: string): boolean => io.fileSystem.exists(candidate),
  });

  if (
    parsed.meta.help ||
    parsed.command === "--help" ||
    parsed.command === "-h" ||
    parsed.command === "help"
  ) {
    console.log(usageText);
    process.exit(0);
  }

  try {
    await run(io, parsed);
  } catch (error) {
    renderFailure(error, parsed.opts.format, canonicalOperation(parsed.command));
    process.exit(1);
  }
}

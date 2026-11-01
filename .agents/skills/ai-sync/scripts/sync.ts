#!/usr/bin/env bun
import { type App, createApp } from "@/scripts/container";
import type { Result } from "@/scripts/domain/plan";
import { canonicalOperation, hasProblem } from "@/scripts/presentation/exit-policy";
import { fallbackUsage, usageText } from "@/scripts/presentation/help";
import { type ParsedArgs, parseArgs } from "@/scripts/presentation/parse-args";
import { renderApplyPlan } from "@/scripts/presentation/render/apply-plan";
import { renderBootstrap } from "@/scripts/presentation/render/bootstrap";
import { renderViewDiff } from "@/scripts/presentation/render/diff";
import { renderDiscover } from "@/scripts/presentation/render/discover";
import { renderFailure } from "@/scripts/presentation/render/failure";
import { renderInit } from "@/scripts/presentation/render/init";
import { renderInspect } from "@/scripts/presentation/render/inspect";
import { renderMigrate } from "@/scripts/presentation/render/migrate";
import { renderPrune } from "@/scripts/presentation/render/prune";
import { renderResolve } from "@/scripts/presentation/render/resolve";
import { renderAddRoot, renderBindRoot } from "@/scripts/presentation/render/root";
import { renderStatus } from "@/scripts/presentation/render/status";
import { renderTrackPath, renderTrackSkill } from "@/scripts/presentation/render/track";
import { renderTransfer } from "@/scripts/presentation/render/transfer";
import { renderUntrack } from "@/scripts/presentation/render/untrack";

const failOnProblem = (result: Result): void => {
  if (hasProblem(result)) process.exitCode = 1;
};

/** Runs one parsed command. Throws on failure; the caller renders the error. */
async function run(app: App, parsed: ParsedArgs): Promise<void> {
  const { command, repo, opts, args, meta } = parsed;
  const { useCases } = app;
  const interactive = process.stdin.isTTY && opts.format !== "json";

  switch (command) {
    case "inspect": {
      const output = useCases.inspectItems.execute({ repoBase: repo, opts });
      renderInspect(output, opts.format);
      failOnProblem(output.result);
      break;
    }
    case "status":
    case "scan": {
      const output = useCases.reportStatus.execute({ repoBase: repo, opts });
      renderStatus(output, opts.format);
      failOnProblem(output.result);
      break;
    }
    case "diff":
      renderViewDiff(useCases.viewDiff.execute({ repoBase: repo, opts }));
      break;
    case "resolve":
    case "review":
      renderResolve(
        await useCases.resolveConflicts.execute({ repoBase: repo, opts, mode: "interactive" }),
      );
      break;
    case "merge":
    case "combine":
      renderResolve(
        await useCases.resolveConflicts.execute({ repoBase: repo, opts, mode: "merge-all" }),
      );
      break;
    case "pull": {
      if (opts.apply && opts.gitPull === undefined && interactive) {
        const answer = await app.prompter.ask(
          "Pull latest changes from remote git repository first? (y/N): ",
        );
        if (/^(y|yes)$/i.test(answer.trim())) opts.gitPull = true;
      }
      const output = useCases.transferChanges.execute({
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
      const output = useCases.transferChanges.execute({
        operation: "push",
        repoBase: repo,
        opts,
      });
      renderTransfer(output, opts.format);
      const { result } = output;
      failOnProblem(result);
      if (opts.apply && result.outcome === "success" && opts.gitPush === undefined && interactive) {
        const answer = await app.prompter.ask(
          "Commit and push backup to remote git repository? (y/N): ",
        );
        if (/^(y|yes)$/i.test(answer.trim())) {
          const gitRes = app.gitGateway.commitAndPush(
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
      const output = useCases.pruneBackup.execute({ repoBase: repo, opts });
      renderPrune(output, opts.format);
      failOnProblem(output.result);
      break;
    }
    case "apply": {
      const planFile = args[0];
      if (!planFile) throw new Error("Usage: apply <plan-file> [--apply] [--format=json]");
      const output = useCases.applySavedPlan.execute({ planFile, opts });
      renderApplyPlan(output, opts.format);
      failOnProblem(output.result);
      break;
    }
    case "init":
      renderInit(useCases.initRepository.execute({ repoBase: repo }));
      break;
    case "root":
      if (args[0] === "add" && args[1] && meta.kind && meta.repoRoot) {
        renderAddRoot(
          useCases.addRoot.execute({
            id: args[1],
            kind: meta.kind,
            repoRoot: meta.repoRoot,
            repoBase: repo,
          }),
        );
      } else if (args[0] === "bind" && args[1] && meta.localRoot) {
        renderBindRoot(
          useCases.bindRoot.execute({ id: args[1], localRoot: meta.localRoot, repoBase: repo }),
        );
      } else {
        throw new Error(
          "Usage: root add <id> --kind <path|skill> --repo-root <relative-path> | root bind <id> --local-root <absolute-or-~/path>",
        );
      }
      break;
    case "track":
      if (args[0] === "path" && args[1] && meta.root) {
        renderTrackPath(
          useCases.trackPath.execute({
            pattern: args[1],
            rootId: meta.root,
            sync: meta.sync ?? true,
            repoBase: repo,
            version: meta.version,
          }),
        );
      } else if (args[0] === "skill" && args[1] && meta.root && meta.origin) {
        renderTrackSkill(
          useCases.trackSkill.execute({
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
          "Usage: track path <pattern> --root <id> | track skill <name> --root <id> --origin <authored|external>",
        );
      }
      break;
    case "untrack":
      if ((args[0] === "path" || args[0] === "skill") && args[1] && meta.root) {
        renderUntrack(
          useCases.untrackEntry.execute({
            kind: args[0],
            name: args[1],
            rootId: meta.root,
            repoBase: repo,
          }),
        );
      } else {
        throw new Error(
          "Usage: untrack path <pattern> --root <id> | untrack skill <name> --root <id>",
        );
      }
      break;
    case "migrate-v2":
      renderMigrate(useCases.migrateV2.execute({ repoBase: repo }));
      break;
    case "bootstrap":
    case "restore": {
      const output = useCases.bootstrapInstalls.execute({
        repoBase: repo,
        format: opts.format,
        approveInstall: opts.approveInstall,
      });
      renderBootstrap(output);
      failOnProblem(output.result);
      break;
    }
    case "discover":
      renderDiscover(
        useCases.discoverCandidates.execute({ repoBase: repo, write: opts.write === true }),
      );
      break;
    default:
      console.log(fallbackUsage);
      process.exit(1);
  }
}

if (import.meta.main) {
  const app = createApp();
  const parsed = parseArgs(process.argv.slice(2), app.environment.defaultRepo, {
    home: app.environment.home,
    pathExists: (candidate: string): boolean => app.fileSystem.exists(candidate),
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
    await run(app, parsed);
  } catch (error) {
    renderFailure(error, parsed.opts.format, canonicalOperation(parsed.command));
    process.exit(1);
  }
}

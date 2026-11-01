#!/usr/bin/env bun
import * as path from "node:path";
import {
  MarkdownTranslation,
  markdownStorePath,
} from "@/scripts/application/services/markdown-translation";
import { ReviewState } from "@/scripts/application/services/review-state";
import { SpecBody } from "@/scripts/application/services/spec-body";
import { CheckReview } from "@/scripts/application/use-cases/check-review";
import { RenderReview } from "@/scripts/application/use-cases/render-review";
import { RenderStages } from "@/scripts/application/use-cases/render-stages";
import { SetupRuntime } from "@/scripts/application/use-cases/setup-runtime";
import { TranslateSpec } from "@/scripts/application/use-cases/translate-spec";
import { ReviewError, SpecParseError, UsageError } from "@/scripts/domain/errors";
import { FsReviewFiles } from "@/scripts/infrastructure/fs-review-files";
import { JsonThaiStore } from "@/scripts/infrastructure/json-thai-store";
import { PythonTranslator } from "@/scripts/infrastructure/python-translator";
import { resolvePaths } from "@/scripts/infrastructure/runtime-config";
import { LocalStageFormats } from "@/scripts/infrastructure/stage-formats";
import { UvRuntime } from "@/scripts/infrastructure/uv-runtime";
import { type ParsedArgs, parseArgs, USAGE } from "@/scripts/presentation/parse-args";
import {
  type Fingerprint,
  type Outcome,
  renderErrorJson,
  renderErrorTree,
  renderJson,
  renderTree,
} from "@/scripts/presentation/render";

const SKILL_DIR = path.resolve(import.meta.dir, "..");

async function run(args: ParsedArgs): Promise<{ outcome: Outcome; fingerprint: Fingerprint }> {
  const paths = resolvePaths(SKILL_DIR);
  const files = new FsReviewFiles();
  if (args.command === "setup") {
    const result = await new SetupRuntime({ runtime: new UvRuntime(paths) }).execute({
      apply: args.apply,
    });
    const mode = args.apply ? "apply" : "preview";
    return {
      outcome: { command: "setup", result },
      fingerprint: { command: "setup", spec: null, store: null, mode },
    };
  }
  if (args.command === "stages") {
    const manifestPath = path.resolve(args.spec ?? "");
    const stagesDir = path.dirname(manifestPath);
    const specBody = async (specPath: string): Promise<{ html: string }> => {
      const specReviewDir = path.join(path.dirname(specPath), ".visual-review");
      const specState = new ReviewState(
        files,
        new JsonThaiStore(files, path.join(specReviewDir, "thai.json")),
      );
      return new SpecBody({ state: specState, files }).build({
        specPath,
        extrasDir: specReviewDir,
        translateHint: `bun scripts/cli.ts translate ${specPath} --apply`,
      });
    };
    const result = await new RenderStages({
      files,
      formats: new LocalStageFormats(),
      markdownStore: (storePath) => new JsonThaiStore(files, storePath),
      specBody,
    }).execute({
      manifestPath,
      templatePath: path.resolve(
        args.template ?? path.join(SKILL_DIR, "assets", "review-template.html"),
      ),
      outPath: path.resolve(args.out ?? path.join(stagesDir, ".visual-review", "review.html")),
      apply: args.apply,
    });
    const mode = args.apply ? "apply" : "preview";
    return {
      outcome: { command: "stages", result },
      fingerprint: { command: "stages", spec: manifestPath, store: null, mode },
    };
  }
  if (args.command === "check-markdown" || args.command === "translate-markdown") {
    const sourcePath = path.resolve(args.spec ?? "");
    const storePath = path.resolve(args.store ?? markdownStorePath(sourcePath));
    const service = new MarkdownTranslation({
      files,
      formats: new LocalStageFormats(),
      store: new JsonThaiStore(files, storePath),
      translator: new PythonTranslator(paths),
    });
    const fingerprint: Fingerprint = {
      command: args.command,
      spec: sourcePath,
      store: storePath,
      mode: args.command === "check-markdown" ? "read-only" : args.apply ? "apply" : "preview",
    };
    if (args.command === "check-markdown") {
      return {
        outcome: { command: args.command, result: await service.check(sourcePath) },
        fingerprint,
      };
    }
    return {
      outcome: {
        command: args.command,
        result: await service.execute({ sourcePath, apply: args.apply }),
      },
      fingerprint,
    };
  }
  const spec = path.resolve(args.spec ?? "");
  const reviewDir = path.join(path.dirname(spec), ".visual-review");
  const storePath = path.resolve(args.store ?? path.join(reviewDir, "thai.json"));
  const store = new JsonThaiStore(files, storePath);
  const state = new ReviewState(files, store);
  const specArg = args.spec ?? "";
  const fingerprint: Fingerprint = {
    command: args.command ?? "check",
    spec,
    store: storePath,
    mode: args.command === "check" ? "read-only" : args.apply ? "apply" : "preview",
  };
  if (args.command === "translate") {
    const translator = new PythonTranslator(paths);
    const result = await new TranslateSpec({ state, store, translator }).execute({
      specPath: spec,
      apply: args.apply,
    });
    return { outcome: { command: "translate", result }, fingerprint };
  }
  if (args.command === "render") {
    const result = await new RenderReview({ state, files }).execute({
      specPath: spec,
      templatePath: path.resolve(
        args.template ?? path.join(SKILL_DIR, "assets", "review-template.html"),
      ),
      outPath: path.resolve(args.out ?? path.join(reviewDir, "review.html")),
      extrasDir: path.resolve(args.extras ?? reviewDir),
      apply: args.apply,
      translateHint: `bun scripts/cli.ts translate ${specArg} --apply`,
    });
    return { outcome: { command: "render", result }, fingerprint };
  }
  const result = await new CheckReview({ state }).execute({ specPath: spec });
  return { outcome: { command: "check", result }, fingerprint };
}

async function main(argv: readonly string[]): Promise<number> {
  let json = argv.includes("--format=json") || argv.join(" ").includes("--format json");
  try {
    const args = parseArgs(argv);
    json = args.format === "json";
    if (args.help) {
      console.log(USAGE);
      return 0;
    }
    const { outcome, fingerprint } = await run(args);
    console.log(
      json ? renderJson(outcome, fingerprint) : renderTree(outcome, fingerprint, args.verbose),
    );
    return (outcome.command === "check" || outcome.command === "check-markdown") &&
      outcome.result.status === "incomplete"
      ? 1
      : 0;
  } catch (error) {
    const known =
      error instanceof ReviewError ||
      error instanceof SpecParseError ||
      error instanceof UsageError;
    if (!known) throw error;
    const recovery = error instanceof ReviewError ? error.recovery : undefined;
    const message = error instanceof UsageError ? `${error.message}\n\n${USAGE}` : error.message;
    console.error(
      json ? renderErrorJson(error.message, recovery) : renderErrorTree(message, recovery),
    );
    return error instanceof UsageError ? 2 : 1;
  }
}

process.exit(await main(Bun.argv.slice(2)));

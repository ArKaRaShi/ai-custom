#!/usr/bin/env bun
import { $ } from "bun";
import { existsSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { homedir } from "os";
import { resolveMarkdownFiles } from "./target-resolver";

export interface FixOptions {
  targets?: string | string[];
  target?: string | string[];
  glob?: string | string[];
  mode?: "ai" | "human";
  format?: "tree" | "json";
  config?: string;
  lintConfig?: string;
  userConfig?: string;
  fallbackConfig?: string;
}

export interface FixResult {
  status: "clean" | "auto-fixed" | "needs-review";
  fixCount: number;
  remainingCount: number;
  rawOutput: string;
  exitCode: number;
}

export async function runFix(options: FixOptions = {}): Promise<FixResult> {
  const rawTargets = options.targets ?? options.target ?? options.glob ?? "**/*.md";
  const targetDisplay = Array.isArray(rawTargets) ? rawTargets.join(", ") : rawTargets;
  const matchedFiles = resolveMarkdownFiles(rawTargets, process.cwd());

  const mode: "ai" | "human" = options.mode === "human" ? "human" : "ai";
  const scriptDir = dirname(dirname(import.meta.path));

  // Determine explicit config overrides
  let explicitLintConfig = options.lintConfig ?? options.userConfig;

  if (options.config) {
    const raw = resolve(process.cwd(), options.config);
    if (existsSync(raw)) {
      if (statSync(raw).isDirectory()) {
        const candidateLintJsonc = resolve(raw, ".markdownlint-cli2.jsonc");
        const candidateLintYaml = resolve(raw, ".markdownlint-cli2.yaml");
        if (existsSync(candidateLintJsonc)) explicitLintConfig = candidateLintJsonc;
        else if (existsSync(candidateLintYaml)) explicitLintConfig = candidateLintYaml;
      } else if (!raw.endsWith(".ini")) {
        explicitLintConfig = raw;
      }
    }
  }

  // Lint Config Resolution (bundled mode by default, no user root fallback)
  const bundledLint = options.fallbackConfig || resolve(scriptDir, `assets/modes/${mode}/.markdownlint-cli2.jsonc`);
  let lintConfigSource = `bundled/${mode}`;
  let configArg: string[] = [];

  if (explicitLintConfig && existsSync(explicitLintConfig)) {
    lintConfigSource = `custom (${explicitLintConfig.replace(homedir(), "~")})`;
    configArg = ["--config", explicitLintConfig];
  } else {
    configArg = ["--config", bundledLint];
  }

  const hasBin = (await $`which markdownlint-cli2`.quiet().nothrow()).exitCode === 0;
  const fileCountLabel = `${matchedFiles.length} file${matchedFiles.length === 1 ? "" : "s"}`;
  const header = `markdown-quality:fix [${fileCountLabel} · mode: ${mode} · target: ${targetDisplay}]`;

  if (options.format !== "json") {
    console.log(header);
    console.log(`  (config: lint → ${lintConfigSource})`);
  }

  if (matchedFiles.length === 0) {
    if (options.format === "json") {
      console.log(JSON.stringify({
        tool: "markdown-quality",
        command: "fix",
        status: "clean",
        fingerprint: { mode, target: targetDisplay, config: lintConfigSource, fileCount: 0 },
        fixCount: 0,
        remainingCount: 0,
      }, null, 2));
    } else {
      console.log("  └─ status: clean (no markdown files found)");
      console.log("Result: CLEAN");
    }
    return {
      status: "clean",
      fixCount: 0,
      remainingCount: 0,
      rawOutput: "",
      exitCode: 0,
    };
  }

  let out = "";
  if (hasBin) {
    out = await $`markdownlint-cli2 ${configArg} --fix ${matchedFiles}`.quiet().nothrow().text();
  } else {
    out = await $`npx -y markdownlint-cli2 ${configArg} --fix ${matchedFiles}`.quiet().nothrow().text();
  }

  const fixMatch = out.match(/Attempted:\s*(\d+)\s*fixes/i);
  const fixCount = fixMatch ? parseInt(fixMatch[1], 10) : 0;

  const mdMatches = out.split("\n").filter((line) => /MD\d{3}/.test(line));
  const remainingCount = mdMatches.length;

  if (remainingCount === 0) {
    const resultStatus = fixCount > 0 ? "auto-fixed" : "clean";
    if (options.format === "json") {
      console.log(JSON.stringify({
        tool: "markdown-quality",
        command: "fix",
        status: resultStatus,
        fingerprint: { mode, target: targetDisplay, config: lintConfigSource, fileCount: matchedFiles.length },
        fixCount,
        remainingCount: 0,
      }, null, 2));
    } else {
      if (fixCount > 0) {
        console.log(`  └─ status: auto-fixed ${fixCount} issue(s) (0 remaining)`);
      } else {
        console.log("  └─ status: clean (0 issues)");
      }
      console.log("Result: CLEAN");
    }
    return {
      status: resultStatus,
      fixCount,
      remainingCount: 0,
      rawOutput: out,
      exitCode: 0,
    };
  } else {
    if (options.format === "json") {
      console.log(JSON.stringify({
        tool: "markdown-quality",
        command: "fix",
        status: "needs_review",
        fingerprint: { mode, target: targetDisplay, config: lintConfigSource, fileCount: matchedFiles.length },
        fixCount,
        remainingCount,
        issues: mdMatches,
      }, null, 2));
    } else {
      console.log(`  └─ status: ✖ ${remainingCount} issue(s) remaining (manual review required)`);
      const maxLines = 15;
      const visible = mdMatches.slice(0, maxLines);
      for (const line of visible) {
        console.log(`     └─ [LINT] ${line}`);
      }
      if (mdMatches.length > maxLines) {
        console.log(`     └─ ... and ${mdMatches.length - maxLines} more`);
      }
      console.log(`Result: NEEDS_REVIEW (${remainingCount} issue(s))`);
    }
    return {
      status: "needs-review",
      fixCount,
      remainingCount,
      rawOutput: out,
      exitCode: 1,
    };
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const targets: string[] = [];
  let mode: "ai" | "human" = "ai";
  let config: string | undefined;
  let lintConfig: string | undefined;
  let format: "tree" | "json" = "tree";

  function fail(message: string): never {
    console.error(message);
    process.exit(1);
  }

  if (args.some((a) => a === "-h" || a === "--help")) {
    console.log(`Usage: fix.ts [options] [targets...]

Auto-fixes structural Markdown issues (whitespace, blank lines, headings, code fences) using markdownlint-cli2.

Arguments:
  [targets...]             Target files, directories, or glob patterns (default: "**/*.md")

Options:
  --mode <ai|human>        Fix mode: ai (strict code fences, compact) or human (relaxed)
  --mode=<ai|human>        Equals-form syntax for --mode (default: ai)
  --config <path>          Smart unified config file or directory
  --config=<path>          Equals-form syntax for --config
  --lint-config <path>     Explicit markdownlint-cli2 configuration override
  --lint-config=<path>     Equals-form syntax for --lint-config
  --format <tree|json>     Output format: tree (default) or machine json
  --format=<tree|json>     Equals-form syntax for --format
  -h, --help               Show this help message and exit

Examples:
  bun fix.ts
  bun fix.ts README.md --mode=human
  bun fix.ts path/to/dir/
  bun fix.ts file1.md file2.md
  bun fix.ts "docs/**/*.md" --lint-config=./custom.jsonc`);
    process.exit(0);
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--mode") {
      const val = args[++i];
      if (!val || val.startsWith("-")) fail("--mode requires a value");
      if (val === "ai" || val === "human") mode = val;
      else fail(`Invalid --mode: ${val}. Must be 'ai' or 'human'.`);
    } else if (arg.startsWith("--mode=")) {
      const val = arg.slice("--mode=".length);
      if (val === "ai" || val === "human") mode = val;
      else fail(`Invalid --mode: ${val}. Must be 'ai' or 'human'.`);
    } else if (arg === "--config") {
      const val = args[++i];
      if (!val || val.startsWith("-")) fail("--config requires a value");
      config = val;
    } else if (arg.startsWith("--config=")) {
      config = arg.slice("--config=".length);
      if (!config) fail("--config requires a value");
    } else if (arg === "--lint-config") {
      const val = args[++i];
      if (!val || val.startsWith("-")) fail("--lint-config requires a value");
      lintConfig = val;
    } else if (arg.startsWith("--lint-config=")) {
      lintConfig = arg.slice("--lint-config=".length);
      if (!lintConfig) fail("--lint-config requires a value");
    } else if (arg === "--format") {
      const val = args[++i];
      if (!val || val.startsWith("-")) fail("--format requires a value");
      if (val === "tree" || val === "json") format = val;
      else fail(`Invalid --format: ${val}. Must be 'tree' or 'json'.`);
    } else if (arg.startsWith("--format=")) {
      const val = arg.slice("--format=".length);
      if (val === "tree" || val === "json") format = val;
      else fail(`Invalid --format: ${val}. Must be 'tree' or 'json'.`);
    } else if (arg.startsWith("-")) {
      fail(`Unknown flag: ${arg}`);
    } else {
      targets.push(arg);
    }
  }

  const result = await runFix({
    targets: targets.length > 0 ? targets : ["**/*.md"],
    mode,
    format,
    config,
    lintConfig,
  });
  process.exit(result.exitCode);
}

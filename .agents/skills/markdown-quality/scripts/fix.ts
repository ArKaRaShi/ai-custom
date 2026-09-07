#!/usr/bin/env bun
import { $ } from "bun";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { homedir } from "os";

export interface FixOptions {
  target?: string;
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
  const target = options.target || "**/*.md";
  const scriptDir = dirname(dirname(import.meta.path));
  const userConfig = options.userConfig || resolve(homedir(), ".markdownlint-cli2.yaml");
  const fallbackConfig = options.fallbackConfig || resolve(scriptDir, "assets/.markdownlint-cli2.jsonc");

  let configSource = "defaults";
  let configArg: string[] = [];

  if (
    existsSync(".markdownlint-cli2.jsonc") ||
    existsSync(".markdownlint-cli2.yaml") ||
    existsSync(".markdownlint.jsonc") ||
    existsSync(".markdownlint.yaml")
  ) {
    configSource = "project-local";
  } else if (existsSync(userConfig)) {
    configSource = `user-global (${userConfig})`;
    configArg = ["--config", userConfig];
  } else if (existsSync(fallbackConfig)) {
    configSource = `bundled-asset (${fallbackConfig})`;
    configArg = ["--config", fallbackConfig];
  }

  const hasBin = (await $`which markdownlint-cli2`.quiet().nothrow()).exitCode === 0;
  const enginePath = hasBin ? (await $`which markdownlint-cli2`.text()).trim() : "npx markdownlint-cli2";

  console.log("==> Tool: markdown-quality (fix)");
  console.log(`Target: ${target}`);
  console.log(`Engine: ${enginePath}`);
  console.log(`Config: ${configSource}`);
  console.log("");

  let out = "";
  if (hasBin) {
    out = await $`markdownlint-cli2 ${configArg} --fix ${target}`.quiet().nothrow().text();
  } else {
    out = await $`npx -y markdownlint-cli2 ${configArg} --fix ${target}`.quiet().nothrow().text();
  }

  const fixMatch = out.match(/Attempted:\s*(\d+)\s*fixes/i);
  const fixCount = fixMatch ? parseInt(fixMatch[1], 10) : 0;

  const mdMatches = out.split("\n").filter((line) => /MD\d{3}/.test(line));
  const remainingCount = mdMatches.length;

  if (remainingCount === 0) {
    if (fixCount > 0) {
      console.log(`Status: auto-fix applied (${fixCount} issues resolved)`);
    } else {
      console.log("Status: clean (0 issues to fix)");
    }
    console.log("Verdict: CLEAN");
    return {
      status: fixCount > 0 ? "auto-fixed" : "clean",
      fixCount,
      remainingCount: 0,
      rawOutput: out,
      exitCode: 0,
    };
  } else {
    console.log(`Status: auto-fix applied (${fixCount} issues resolved, ${remainingCount} manual fixes required)`);
    for (const line of mdMatches) {
      console.log(`[LINT] ${line}`);
    }
    console.log(`Verdict: NEEDS_REVIEW (${remainingCount} remaining issues)`);
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
  const target = process.argv[2] || "**/*.md";
  const result = await runFix({ target });
  process.exit(result.exitCode);
}

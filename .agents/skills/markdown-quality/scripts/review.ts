#!/usr/bin/env bun
import { $ } from "bun";
import { existsSync, readFileSync, statSync, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { randomUUID } from "crypto";
import { homedir } from "os";
import { resolveMarkdownFiles } from "./target-resolver";
import { checkMarkdownLinks, type BrokenLink } from "./link-checker";
import { analyzeTokenDensity, type TokenDensityReport } from "./token-density";
import { checkMarkdownSecurity, type SecurityFinding } from "./security-check";
import { checkMarkdownStructure, type StructureFinding } from "./structure-check";

export interface ReviewOptions {
  text?: string;
  targets?: string | string[];
  target?: string | string[];
  glob?: string | string[];
  mode?: "ai" | "human";
  fix?: boolean;
  minLevel?: "error" | "warning" | "suggestion";
  checkLinks?: boolean;
  checkDensity?: boolean;
  checkSecurity?: boolean;
  checkStructure?: boolean;
  config?: string;
  lintConfig?: string;
  valeConfig?: string;
  userConfig?: string;
  fallbackConfig?: string;
  valeUserConfig?: string;
  valeFallbackConfig?: string;
  format?: "tree" | "json";
  verbose?: boolean;
}

export interface ReviewResult {
  lintErrors: number;
  valeErrors: number;
  valeWarnings: number;
  brokenLinksCount: number;
  securityIssuesCount: number;
  structureIssuesCount: number;
  totalErrors: number;
  densityReports: Array<{ file: string; report: TokenDensityReport }>;
  verdict: "CLEAN" | "NEEDS_REVIEW";
  exitCode: number;
}

interface ValeAlert {
  Check: string;
  Message: string;
  Severity: string;
  Line: number;
  Span: [number, number];
}

function isValeAlert(item: unknown): item is ValeAlert {
  if (typeof item !== "object" || item === null) return false;
  const record = item as Record<string, unknown>;
  return (
    typeof record.Check === "string" &&
    typeof record.Message === "string" &&
    typeof record.Severity === "string" &&
    typeof record.Line === "number" &&
    Array.isArray(record.Span) &&
    record.Span.length === 2
  );
}

// Vale reports one Severity per alert; only `error` blocks the review, warnings and suggestions inform.
function parseValeAlerts(json: string): Array<{ line: string; blocking: boolean }> {
  if (json.trim() === "") return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error(`vale did not return JSON: ${json.slice(0, 200)}`);
  }
  if (typeof raw !== "object" || raw === null) return [];
  const record = raw as Record<string, unknown>;

  return Object.entries(record).flatMap(([file, alerts]) => {
    if (!Array.isArray(alerts)) return [];
    return alerts.filter(isValeAlert).map((a) => ({
      line: `${file}:${a.Line}:${a.Span[0]}:${a.Check}:${a.Message}`,
      blocking: a.Severity === "error",
    }));
  });
}

interface TreeBranch {
  name: string;
  status: string;
  isError: boolean;
  children?: string[];
}

function renderTree(header: string, configNotice: string, branches: TreeBranch[], verbose: boolean): void {
  console.log(header);
  console.log(`  (${configNotice})`);
  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i];
    const isLast = i === branches.length - 1;
    const prefix = isLast ? "  └─ " : "  ├─ ";
    const childPipe = isLast ? "     " : "  │  ";

    console.log(`${prefix}${branch.name.padEnd(14)} ${branch.status}`);
    if (branch.children && branch.children.length > 0) {
      const maxChildren = verbose ? branch.children.length : 15;
      const visible = branch.children.slice(0, maxChildren);
      for (const child of visible) {
        console.log(`${childPipe}└─ ${child}`);
      }
      if (branch.children.length > maxChildren) {
        console.log(`${childPipe}└─ ... and ${branch.children.length - maxChildren} more (run with --verbose or --format=json to list every finding)`);
      }
    }
  }
}

export async function runReview(options: ReviewOptions = {}): Promise<ReviewResult> {
  const isTextInput = typeof options.text === "string";
  const rawTargets = isTextInput ? ["<string>"] : (options.targets ?? options.target ?? options.glob ?? "**/*.md");
  const targetDisplay = isTextInput ? (options.text!.length > 50 ? options.text!.slice(0, 47) + "..." : options.text!) : (Array.isArray(rawTargets) ? rawTargets.join(", ") : rawTargets);
  const matchedFiles = isTextInput ? ["<string>"] : resolveMarkdownFiles(rawTargets, process.cwd());
  const mode: "ai" | "human" = options.mode === "human" ? "human" : "ai";
  const fix = options.fix ?? false;
  const minLevel = options.minLevel || "warning";
  const checkLinks = options.checkLinks ?? true;
  const checkDensity = options.checkDensity ?? true;
  const checkSecurity = options.checkSecurity ?? true;
  const checkStructure = options.checkStructure ?? true;

  const scriptDir = dirname(dirname(import.meta.path));

  // Smart Config Overrides
  let explicitLintConfig = options.lintConfig ?? options.userConfig;
  let explicitValeConfig = options.valeConfig ?? options.valeUserConfig;

  if (options.config) {
    const raw = resolve(process.cwd(), options.config);
    if (existsSync(raw)) {
      if (statSync(raw).isDirectory()) {
        const candidateLintJsonc = resolve(raw, ".markdownlint-cli2.jsonc");
        const candidateLintYaml = resolve(raw, ".markdownlint-cli2.yaml");
        const candidateVale = resolve(raw, ".vale.ini");
        if (existsSync(candidateLintJsonc)) explicitLintConfig = candidateLintJsonc;
        else if (existsSync(candidateLintYaml)) explicitLintConfig = candidateLintYaml;
        if (existsSync(candidateVale)) explicitValeConfig = candidateVale;
      } else if (raw.endsWith(".ini")) {
        explicitValeConfig = raw;
      } else {
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

  // Vale Config Resolution (bundled mode by default, no user root fallback)
  const bundledVale = options.valeFallbackConfig || resolve(scriptDir, `assets/modes/${mode}/.vale.ini`);
  let valeConfigSource = `bundled/${mode}`;
  let valeConfigArg: string[] = [];

  if (explicitValeConfig && existsSync(explicitValeConfig)) {
    valeConfigSource = `custom (${explicitValeConfig.replace(homedir(), "~")})`;
    valeConfigArg = ["--config", explicitValeConfig];
  } else {
    valeConfigArg = ["--config", bundledVale];
  }

  const configNotice = `configs: lint → ${lintConfigSource} · vale → ${valeConfigSource}`;
  const fileCountLabel = `${matchedFiles.length} file${matchedFiles.length === 1 ? "" : "s"}`;
  const header = `markdown-quality [${fileCountLabel} · mode: ${mode} · target: ${targetDisplay}]`;

  if (matchedFiles.length === 0) {
    renderTree(header, configNotice, [
      {
        name: "status",
        status: "clean (no markdown files found)",
        isError: false,
      },
    ], options.verbose === true);
    console.log("Result: CLEAN");
    return {
      lintErrors: 0,
      valeErrors: 0,
      valeWarnings: 0,
      brokenLinksCount: 0,
      securityIssuesCount: 0,
      structureIssuesCount: 0,
      totalErrors: 0,
      densityReports: [],
      verdict: "CLEAN",
      exitCode: 0,
    };
  }

  const branches: TreeBranch[] = [];

  // --- Phase 1: Standards (markdownlint-cli2) ---
  const hasLintBin = (await $`which markdownlint-cli2`.quiet().nothrow()).exitCode === 0;
  let lintFixCount = 0;
  if (fix) {
    if (hasLintBin) {
      const fixProc = await $`markdownlint-cli2 --no-globs ${configArg} --fix ${matchedFiles}`.quiet().nothrow();
      const fixOut = fixProc.stdout.toString() + "\n" + fixProc.stderr.toString();
      const m = fixOut.match(/Attempted:\s*(\d+)\s*fixes/i);
      lintFixCount = m ? parseInt(m[1], 10) : 0;
    } else {
      const fixProc = await $`npx -y markdownlint-cli2 --no-globs ${configArg} --fix ${matchedFiles}`.quiet().nothrow();
      const fixOut = fixProc.stdout.toString() + "\n" + fixProc.stderr.toString();
      const m = fixOut.match(/Attempted:\s*(\d+)\s*fixes/i);
      lintFixCount = m ? parseInt(m[1], 10) : 0;
    }
  }
  let lintOut = "";
  if (isTextInput) {
    const lintProc = Bun.spawnSync(
      hasLintBin ? ["markdownlint-cli2", "--no-globs", ...configArg, "-"] : ["npx", "-y", "markdownlint-cli2", "--no-globs", ...configArg, "-"],
      { stdin: Buffer.from(options.text!), stdout: "pipe", stderr: "pipe" },
    );
    lintOut = lintProc.stdout.toString() + "\n" + lintProc.stderr.toString();
  } else if (hasLintBin) {
    const proc = await $`markdownlint-cli2 --no-globs ${configArg} ${matchedFiles}`.quiet().nothrow();
    lintOut = proc.stdout.toString() + "\n" + proc.stderr.toString();
  } else {
    const proc = await $`npx -y markdownlint-cli2 --no-globs ${configArg} ${matchedFiles}`.quiet().nothrow();
    lintOut = proc.stdout.toString() + "\n" + proc.stderr.toString();
  }

  const lintLines = lintOut.split("\n").filter((line) => /MD\d{3}/.test(line));
  const lintErrors = lintLines.length;

  if (lintErrors === 0) {
    const fixNote = lintFixCount > 0 ? ` (auto-fixed ${lintFixCount})` : "";
    branches.push({
      name: "standards",
      status: `✔ ok${fixNote}`,
      isError: false,
    });
  } else {
    branches.push({
      name: "standards",
      status: `✖ ${lintErrors} issue(s)`,
      isError: true,
      children: lintLines,
    });
  }

  // --- Phase 2: Prose & AI-Tells (Vale) ---
  let valeErrors = 0;
  let valeWarnings = 0;
  let valeErrorLines: string[] = [];
  let valeWarningLines: string[] = [];
  const hasVale = (await $`which vale`.quiet().nothrow()).exitCode === 0;
  if (hasVale) {
    let valeOut = "";
    if (isTextInput) {
      const valeProc = Bun.spawnSync(
        ["vale", "--no-global", "--ext=.md", ...valeConfigArg, `--minAlertLevel=${minLevel}`, "--output=JSON"],
        { stdin: Buffer.from(options.text!), stdout: "pipe", stderr: "pipe" },
      );
      valeOut = valeProc.stdout.toString();
    } else {
      valeOut = await $`vale --no-global ${valeConfigArg} --minAlertLevel=${minLevel} --output=JSON ${matchedFiles}`
        .quiet()
        .nothrow()
        .text();
    }

    const alerts = parseValeAlerts(valeOut);
    valeErrorLines = alerts.filter((a) => a.blocking).map((a) => a.line);
    valeWarningLines = alerts.filter((a) => !a.blocking).map((a) => a.line);
    valeErrors = valeErrorLines.length;
    valeWarnings = valeWarningLines.length;
    const warningNote = valeWarnings > 0 ? ` · ${valeWarnings} warning(s)` : "";
    if (valeErrors === 0) {
      branches.push({
        name: "prose/vale",
        status: `✔ ok${warningNote}`,
        isError: false,
        children: valeWarnings > 0 ? valeWarningLines.map((l) => `(warning) ${l}`) : undefined,
      });
    } else {
      branches.push({
        name: "prose/vale",
        status: `✖ ${valeErrors} issue(s)${warningNote}`,
        isError: true,
        children: [...valeErrorLines, ...valeWarningLines.map((l) => `(warning) ${l}`)],
      });
    }
  } else {
    branches.push({
      name: "prose/vale",
      status: "- skipped (vale binary not found)",
      isError: false,
    });
  }

  // --- Phase 3: Link Integrity ---
  let totalBrokenLinks: BrokenLink[] = [];
  if (checkLinks) {
    if (isTextInput) {
      const linkRes = checkMarkdownLinks("<string>", options.text!);
      totalBrokenLinks.push(...linkRes.brokenLinks);
    } else {
      for (const f of matchedFiles) {
        if (existsSync(f) && statSync(f).isFile()) {
          const linkRes = checkMarkdownLinks(f);
          totalBrokenLinks.push(...linkRes.brokenLinks);
        }
      }
    }
    if (totalBrokenLinks.length === 0) {
      branches.push({
        name: "links",
        status: "✔ 0 broken",
        isError: false,
      });
    } else {
      branches.push({
        name: "links",
        status: `✖ ${totalBrokenLinks.length} broken`,
        isError: true,
        children: totalBrokenLinks.map((b) => `${b.file}:${b.line} -> '${b.rawTarget}' (${b.reason})`),
      });
    }
  } else {
    branches.push({
      name: "links",
      status: "- skipped",
      isError: false,
    });
  }

  // --- Phase 4: Document Structure (Depth & Orphans) ---
  let totalStructureIssues: Array<{ file: string; finding: StructureFinding }> = [];
  if (checkStructure) {
    if (isTextInput) {
      const structRes = checkMarkdownStructure(options.text!);
      for (const finding of structRes.findings) {
        totalStructureIssues.push({ file: "<string>", finding });
      }
    } else {
      for (const f of matchedFiles) {
        if (existsSync(f) && statSync(f).isFile()) {
          try {
            const content = readFileSync(f, "utf-8");
            const structRes = checkMarkdownStructure(content);
            for (const finding of structRes.findings) {
              totalStructureIssues.push({ file: f, finding });
            }
          } catch {}
        }
      }
    }
    if (totalStructureIssues.length === 0) {
      branches.push({
        name: "structure",
        status: "✔ 0 issues",
        isError: false,
      });
    } else {
      branches.push({
        name: "structure",
        status: `✖ ${totalStructureIssues.length} issue(s)`,
        isError: true,
        children: totalStructureIssues.map(
          (s) => `${s.file}:${s.finding.line} [${s.finding.type}] ${s.finding.reason}: ${s.finding.match}`
        ),
      });
    }
  } else {
    branches.push({
      name: "structure",
      status: "- skipped",
      isError: false,
    });
  }

  // --- Phase 5: Security & Secret Leak Scanner ---
  let totalSecurityIssues: Array<{ file: string; finding: SecurityFinding }> = [];
  if (checkSecurity) {
    if (isTextInput) {
      const secRes = checkMarkdownSecurity(options.text!);
      for (const finding of secRes.findings) {
        totalSecurityIssues.push({ file: "<string>", finding });
      }
    } else {
      for (const f of matchedFiles) {
        if (existsSync(f) && statSync(f).isFile()) {
          try {
            const content = readFileSync(f, "utf-8");
            const secRes = checkMarkdownSecurity(content);
            for (const finding of secRes.findings) {
              totalSecurityIssues.push({ file: f, finding });
            }
          } catch {}
        }
      }
    }
    if (totalSecurityIssues.length === 0) {
      branches.push({
        name: "security",
        status: "✔ 0 leaks",
        isError: false,
      });
    } else {
      branches.push({
        name: "security",
        status: `✖ ${totalSecurityIssues.length} leak(s)`,
        isError: true,
        children: totalSecurityIssues.map(
          (s) => `${s.file}:${s.finding.line} [${s.finding.type}] ${s.finding.reason}: ${s.finding.match}`
        ),
      });
    }
  } else {
    branches.push({
      name: "security",
      status: "- skipped",
      isError: false,
    });
  }

  // --- Phase 6: Token Density & Context Efficiency ---
  const densityReports: Array<{ file: string; report: TokenDensityReport }> = [];
  if (checkDensity) {
    let totalTokens = 0;
    let totalWords = 0;
    const densityWarnings: string[] = [];

    if (isTextInput) {
      const report = analyzeTokenDensity(options.text!);
      densityReports.push({ file: "<string>", report });
      totalTokens += report.estimatedTokens;
      totalWords += report.wordCount;
      for (const fm of report.fillerMatches) {
        densityWarnings.push(`<string>:${fm.line} filler detected '${fm.phrase}'`);
      }
      for (const cm of report.condescendingMatches) {
        densityWarnings.push(`<string>:${cm.line} presumptuous word '${cm.phrase}'`);
      }
    } else {
      for (const f of matchedFiles) {
        if (existsSync(f) && statSync(f).isFile()) {
          try {
            const content = readFileSync(f, "utf-8");
            const report = analyzeTokenDensity(content);
            densityReports.push({ file: f, report });
            totalTokens += report.estimatedTokens;
            totalWords += report.wordCount;
            for (const fm of report.fillerMatches) {
              densityWarnings.push(`${f}:${fm.line} filler detected '${fm.phrase}'`);
            }
            for (const cm of report.condescendingMatches) {
              densityWarnings.push(`${f}:${cm.line} presumptuous word '${cm.phrase}'`);
            }
          } catch {}
        }
      }
    }

    if (mode === "human") {
      branches.push({
        name: "density",
        status: `✔ ${matchedFiles.length} file(s) · ${totalWords} words`,
        isError: false,
      });
    } else {
      if (matchedFiles.length === 1 && densityReports[0]) {
        const rep = densityReports[0].report;
        branches.push({
          name: "density",
          status: `✔ ~${rep.estimatedTokens} tokens (${rep.densityRating})`,
          isError: false,
          children: densityWarnings.length > 0 ? densityWarnings : undefined,
        });
      } else {
        branches.push({
          name: "density",
          status: `✔ ${matchedFiles.length} files · ~${totalTokens} tokens total`,
          isError: false,
          children: densityWarnings.length > 0 ? densityWarnings : undefined,
        });
      }
    }
  } else {
    branches.push({
      name: "density",
      status: "- skipped",
      isError: false,
    });
  }

  const brokenLinksCount = totalBrokenLinks.length;
  const securityIssuesCount = totalSecurityIssues.length;
  const structureIssuesCount = totalStructureIssues.length;
  const totalErrors = lintErrors + valeErrors + brokenLinksCount + securityIssuesCount + structureIssuesCount;
  const verdict = totalErrors === 0 ? "CLEAN" : "NEEDS_REVIEW";

  const findingKeys: Record<string, "lint" | "links" | "structure" | "security"> = {
    standards: "lint",
    links: "links",
    structure: "structure",
    security: "security",
  };
  interface FindingMap {
    lint: string[];
    prose: string[];
    warnings: string[];
    links: string[];
    structure: string[];
    security: string[];
  }
  const findings: FindingMap = {
    lint: [],
    prose: valeErrorLines,
    warnings: valeWarningLines,
    links: [],
    structure: [],
    security: [],
  };
  for (const branch of branches) {
    const key = findingKeys[branch.name];
    if (key && branch.isError) findings[key].push(...(branch.children ?? []));
  }

  if (options.format === "json") {
    const jsonOutput = {
      tool: "markdown-quality",
      command: "review",
      status: totalErrors === 0 ? "clean" : "needs_review",
      verdict,
      fingerprint: {
        mode,
        target: targetDisplay,
        fileCount: matchedFiles.length,
        files: matchedFiles,
        configs: { lint: lintConfigSource, vale: valeConfigSource },
      },
      summary: {
        totalErrors,
        lintErrors,
        valeErrors,
        valeWarnings,
        brokenLinks: brokenLinksCount,
        securityIssues: securityIssuesCount,
        structureIssues: structureIssuesCount,
      },
      findings,
      density: densityReports,
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
  } else {
    renderTree(header, configNotice, branches, options.verbose === true);
    if (totalErrors === 0) {
      console.log(valeWarnings > 0 ? `Result: CLEAN (${valeWarnings} warning(s))` : "Result: CLEAN");
    } else {
      console.log(`Result: NEEDS_REVIEW (${totalErrors} total issue(s))`);
    }
  }

  return {
    lintErrors,
    valeErrors,
    valeWarnings,
    brokenLinksCount,
    securityIssuesCount,
    structureIssuesCount,
    totalErrors,
    densityReports,
    verdict,
    exitCode: totalErrors === 0 ? 0 : 1,
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const targets: string[] = [];
  let mode: "ai" | "human" = "ai";
  let fix = false;
  let minLevel: "error" | "warning" | "suggestion" = "warning";
  let checkLinks = true;
  let checkDensity = true;
  let checkSecurity = true;
  let checkStructure = true;
  let config: string | undefined;
  let lintConfig: string | undefined;
  let valeConfig: string | undefined;
  let format: "tree" | "json" = "tree";
  let verbose = false;
  let text: string | undefined;
  function fail(message: string): never {
    console.error(message);
    process.exit(1);
  }

  if (args.some((a) => a === "-h" || a === "--help")) {
    console.log(`Usage: review.ts [options] [targets...]

Comprehensive QA review for Markdown documentation, agent instructions, and guides.

Arguments:
  [targets...]             Target files, directories, or glob patterns (default: "**/*.md")

Options:
  --mode <ai|human>        Review mode: ai (token-dense, strict AI-tells) or human (readability, relaxed)
  --mode=<ai|human>        Equals-form syntax for --mode (default: ai)
  --config <path>          Smart unified config file or directory
  --config=<path>          Equals-form syntax for --config
  --lint-config <path>     Explicit markdownlint-cli2 configuration override
  --lint-config=<path>     Equals-form syntax for --lint-config
  --vale-config <path>     Explicit Vale configuration override
  --vale-config=<path>     Equals-form syntax for --vale-config
  --format <tree|json>     Output format: tree (default) or machine json
  --format=<tree|json>     Equals-form syntax for --format
  --fix                    Apply automatic structural fixes via markdownlint-cli2 before review
  --verbose                Print every finding in the tree instead of the first 15 per check (json always lists all)
  --min-level <level>      Vale minimum alert level: error, warning, suggestion (default: warning). Only error findings block (exit 1); warnings and suggestions are listed
  --min-level=<level>      Equals-form syntax for --min-level
  --no-links               Skip Phase 3: link integrity check
  --no-structure           Skip Phase 4: document structure check (heading depth, orphans, latex)
  --no-security            Skip Phase 5: security & credential leak scanner
  --no-density             Skip Phase 6: token density & AI context efficiency check
  -h, --help               Show this help message and exit
  --text <content>         Review text and save a reusable artifact under .tmp-markdown-quality/
  --text=<content>         Equals-form syntax for --text
Examples:
  bun review.ts
  bun review.ts README.md --mode=human
  bun review.ts path/to/dir/
  bun review.ts "docs/**/*.md" --fix
  bun review.ts file1.md --config=./my-rules/`);
    process.exit(0);
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--verbose") {
      verbose = true;
    } else if (arg === "--fix") {
      fix = true;
    } else if (arg === "--no-links") {
      checkLinks = false;
    } else if (arg === "--no-density") {
      checkDensity = false;
    } else if (arg === "--no-security") {
      checkSecurity = false;
    } else if (arg === "--no-structure") {
      checkStructure = false;
    } else if (arg === "--mode") {
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
    } else if (arg === "--vale-config") {
      const val = args[++i];
      if (!val || val.startsWith("-")) fail("--vale-config requires a value");
      valeConfig = val;
    } else if (arg.startsWith("--vale-config=")) {
      valeConfig = arg.slice("--vale-config=".length);
      if (!valeConfig) fail("--vale-config requires a value");
    } else if (arg === "--min-level") {
      const val = args[++i];
      if (!val || val.startsWith("-")) fail("--min-level requires a value");
      if (val === "error" || val === "warning" || val === "suggestion") {
        minLevel = val;
      } else {
        fail(`Invalid --min-level value: ${val}. Must be error, warning, or suggestion.`);
      }
    } else if (arg.startsWith("--min-level=")) {
      const val = arg.slice("--min-level=".length);
      if (!val) fail("--min-level requires a value");
      if (val === "error" || val === "warning" || val === "suggestion") {
        minLevel = val;
      } else {
        fail(`Invalid --min-level value: ${val}. Must be error, warning, or suggestion.`);
      }
    } else if (arg === "--format") {
      const val = args[++i];
      if (!val || val.startsWith("-")) fail("--format requires a value");
      if (val === "tree" || val === "json") format = val;
      else fail(`Invalid --format: ${val}. Must be 'tree' or 'json'.`);
    } else if (arg.startsWith("--format=")) {
      const val = arg.slice("--format=".length);
      if (val === "tree" || val === "json") format = val;
      else fail(`Invalid --format: ${val}. Must be 'tree' or 'json'.`);
    } else if (arg === "--text") {
      const val = args[++i];
      if (val === undefined) fail("--text requires a value");
      text = val;
    } else if (arg.startsWith("--text=")) {
      text = arg.slice("--text=".length);
    } else if (arg.startsWith("-")) {
      fail(`Unknown flag: ${arg}`);
    } else {
      targets.push(arg);
    }
  }

  if (text !== undefined) {
    const artifactDir = resolve(process.cwd(), ".tmp-markdown-quality");
    mkdirSync(artifactDir, { recursive: true });
    const artifact = resolve(artifactDir, `${Date.now()}-${randomUUID()}-text.md`);
    writeFileSync(artifact, text);
    console.error(`Saved text artifact: ${artifact}`);
    console.error(`Reuse this path for another review. When finished, preview cleanup with:\nbun "${dirname(import.meta.path)}/cleanup.ts" "${artifact}"`);
    console.error("Delete it with --apply when ready.");
  }

  const result = await runReview({
    targets: targets.length > 0 ? targets : ["**/*.md"],
    mode,
    format,
    config,
    text,
    lintConfig,
    valeConfig,
    fix,
    minLevel,
    verbose,
    checkLinks,
    checkDensity,
    checkSecurity,
    checkStructure,
  });
  process.exit(result.exitCode);
}

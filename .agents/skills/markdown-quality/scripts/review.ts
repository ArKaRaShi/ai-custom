#!/usr/bin/env bun
import { $ } from "bun";
import { existsSync, readFileSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { homedir } from "os";
import { resolveMarkdownFiles } from "./target-resolver";
import { checkMarkdownLinks, type BrokenLink } from "./link-checker";
import { analyzeTokenDensity, type TokenDensityReport } from "./token-density";
import { checkMarkdownSecurity, type SecurityFinding } from "./security-check";
import { checkMarkdownStructure, type StructureFinding } from "./structure-check";

export interface ReviewOptions {
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
}

export interface ReviewResult {
  lintErrors: number;
  valeErrors: number;
  brokenLinksCount: number;
  securityIssuesCount: number;
  structureIssuesCount: number;
  totalErrors: number;
  densityReports: Array<{ file: string; report: TokenDensityReport }>;
  verdict: "CLEAN" | "NEEDS_REVIEW";
  exitCode: number;
}

interface TreeBranch {
  name: string;
  status: string;
  isError: boolean;
  children?: string[];
}

function renderTree(header: string, configNotice: string, branches: TreeBranch[]): void {
  console.log(header);
  console.log(`  (${configNotice})`);
  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i];
    const isLast = i === branches.length - 1;
    const prefix = isLast ? "  └─ " : "  ├─ ";
    const childPipe = isLast ? "     " : "  │  ";

    console.log(`${prefix}${branch.name.padEnd(14)} ${branch.status}`);
    if (branch.children && branch.children.length > 0) {
      const maxChildren = 15;
      const visible = branch.children.slice(0, maxChildren);
      for (const child of visible) {
        console.log(`${childPipe}└─ ${child}`);
      }
      if (branch.children.length > maxChildren) {
        console.log(`${childPipe}└─ ... and ${branch.children.length - maxChildren} more`);
      }
    }
  }
}

export async function runReview(options: ReviewOptions = {}): Promise<ReviewResult> {
  const rawTargets = options.targets ?? options.target ?? options.glob ?? "**/*.md";
  const targetDisplay = Array.isArray(rawTargets) ? rawTargets.join(", ") : rawTargets;
  const matchedFiles = resolveMarkdownFiles(rawTargets, process.cwd());

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
    ]);
    console.log("Result: CLEAN");
    return {
      lintErrors: 0,
      valeErrors: 0,
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
      const fixOut = await $`markdownlint-cli2 ${configArg} --fix ${matchedFiles}`.quiet().nothrow().text();
      const m = fixOut.match(/Attempted:\s*(\d+)\s*fixes/i);
      lintFixCount = m ? parseInt(m[1], 10) : 0;
    } else {
      const fixOut = await $`npx -y markdownlint-cli2 ${configArg} --fix ${matchedFiles}`.quiet().nothrow().text();
      const m = fixOut.match(/Attempted:\s*(\d+)\s*fixes/i);
      lintFixCount = m ? parseInt(m[1], 10) : 0;
    }
  }

  let lintOut = "";
  if (hasLintBin) {
    lintOut = await $`markdownlint-cli2 ${configArg} ${matchedFiles}`.quiet().nothrow().text();
  } else {
    lintOut = await $`npx -y markdownlint-cli2 ${configArg} ${matchedFiles}`.quiet().nothrow().text();
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
  const hasVale = (await $`which vale`.quiet().nothrow()).exitCode === 0;

  if (hasVale) {
    const valeOut = await $`vale ${valeConfigArg} --minAlertLevel=${minLevel} --output=line ${matchedFiles}`
      .quiet()
      .nothrow()
      .text();

    const rawValeLines = valeOut
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    valeErrors = rawValeLines.length;
    if (valeErrors === 0) {
      branches.push({
        name: "prose/vale",
        status: "✔ ok",
        isError: false,
      });
    } else {
      branches.push({
        name: "prose/vale",
        status: `✖ ${valeErrors} issue(s)`,
        isError: true,
        children: rawValeLines,
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
    for (const f of matchedFiles) {
      if (existsSync(f) && statSync(f).isFile()) {
        const linkRes = checkMarkdownLinks(f);
        totalBrokenLinks.push(...linkRes.brokenLinks);
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
          (s) => `${s.file}:${s.finding.line} [${s.finding.rule}] ${s.finding.message}`
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
          (s) => `${s.file}:${s.finding.line} [${s.finding.rule}] ${s.finding.message}`
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
        brokenLinks: brokenLinksCount,
        securityIssues: securityIssuesCount,
        structureIssues: structureIssuesCount,
      },
      density: densityReports,
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
  } else {
    renderTree(header, configNotice, branches);
    if (totalErrors === 0) {
      console.log("Result: CLEAN");
    } else {
      console.log(`Result: NEEDS_REVIEW (${totalErrors} total issue(s))`);
    }
  }

  return {
    lintErrors,
    valeErrors,
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
  --min-level <level>      Vale minimum alert level: error, warning, suggestion (default: warning)
  --min-level=<level>      Equals-form syntax for --min-level
  --no-links               Skip Phase 3: link integrity check
  --no-structure           Skip Phase 4: document structure check (heading depth, orphans, latex)
  --no-security            Skip Phase 5: security & credential leak scanner
  --no-density             Skip Phase 6: token density & AI context efficiency check
  -h, --help               Show this help message and exit

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
    if (arg === "--fix") {
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
    } else if (arg.startsWith("-")) {
      fail(`Unknown flag: ${arg}`);
    } else {
      targets.push(arg);
    }
  }

  const result = await runReview({
    targets: targets.length > 0 ? targets : ["**/*.md"],
    mode,
    format,
    config,
    lintConfig,
    valeConfig,
    fix,
    minLevel,
    checkLinks,
    checkDensity,
    checkSecurity,
    checkStructure,
  });
  process.exit(result.exitCode);
}

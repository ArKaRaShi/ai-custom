#!/usr/bin/env bun
import { $ } from "bun";
import { existsSync, readFileSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { homedir } from "os";
import { checkMarkdownLinks, type BrokenLink } from "./link-checker";
import { analyzeTokenDensity, type TokenDensityReport } from "./token-density";
import { checkMarkdownSecurity, type SecurityFinding } from "./security-check";
import { checkMarkdownStructure, type StructureFinding } from "./structure-check";

export interface ReviewOptions {
  glob?: string;
  fix?: boolean;
  minLevel?: "error" | "warning" | "suggestion";
  checkLinks?: boolean;
  checkDensity?: boolean;
  checkSecurity?: boolean;
  checkStructure?: boolean;
  userConfig?: string;
  fallbackConfig?: string;
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

/**
 * Resolves matched files using Bun.Glob (native, zero external dependencies).
 */
function resolveFiles(pattern: string): string[] {
  if (existsSync(pattern) && statSync(pattern).isFile()) {
    return [pattern];
  }
  try {
    const glob = new Bun.Glob(pattern);
    const files: string[] = [];
    for (const file of glob.scanSync({
      cwd: process.cwd(),
      onlyFiles: true,
      throwErrorOnBrokenSymbolicLink: false,
    })) {
      if (
        !file.startsWith("node_modules/") &&
        !file.startsWith(".git/") &&
        !file.startsWith("dist/") &&
        !file.startsWith("build/")
      ) {
        files.push(file);
      }
    }
    return files.length > 0 ? files : [pattern];
  } catch {
    return [pattern];
  }
}

export async function runReview(options: ReviewOptions = {}): Promise<ReviewResult> {
  const targetGlob = options.glob || "**/*.md";
  const fix = options.fix ?? false;
  const minLevel = options.minLevel || "warning";
  const checkLinks = options.checkLinks ?? true;
  const checkDensity = options.checkDensity ?? true;
  const checkSecurity = options.checkSecurity ?? true;
  const checkStructure = options.checkStructure ?? true;

  const scriptDir = dirname(dirname(import.meta.path));
  const userConfig = options.userConfig || resolve(homedir(), ".markdownlint-cli2.yaml");
  const fallbackConfig = options.fallbackConfig || resolve(scriptDir, "assets/.markdownlint-cli2.jsonc");

  // Config Resolution for markdownlint-cli2
  let lintConfigSource = "defaults";
  let configArg: string[] = [];

  if (
    existsSync(".markdownlint-cli2.jsonc") ||
    existsSync(".markdownlint-cli2.yaml") ||
    existsSync(".markdownlint.jsonc") ||
    existsSync(".markdownlint.yaml")
  ) {
    lintConfigSource = "project-local";
  } else if (existsSync(userConfig)) {
    lintConfigSource = `user-global (${userConfig})`;
    configArg = ["--config", userConfig];
  } else if (existsSync(fallbackConfig)) {
    lintConfigSource = `bundled-asset (${fallbackConfig})`;
    configArg = ["--config", fallbackConfig];
  }

  // Config Resolution for Vale
  const userVale = resolve(homedir(), "Library/Application Support/vale/.vale.ini");
  let valeConfigSource = "disabled";
  let valeConfigArg: string[] = [];
  let valeStyles = "unknown";

  if (existsSync(".vale.ini")) {
    valeConfigSource = "project-local (.vale.ini)";
    valeConfigArg = ["--config", ".vale.ini"];
    try {
      const content = readFileSync(".vale.ini", "utf-8");
      const m = content.match(/BasedOnStyles\s*=\s*(.+)/);
      if (m) valeStyles = m[1].trim();
    } catch {}
  } else if (existsSync(userVale)) {
    valeConfigSource = `user-global (${userVale})`;
    valeConfigArg = ["--config", userVale];
    try {
      const content = readFileSync(userVale, "utf-8");
      const m = content.match(/BasedOnStyles\s*=\s*(.+)/);
      if (m) valeStyles = m[1].trim();
    } catch {}
  }

  console.log("==> Tool: markdown-quality (review)");
  console.log(`Target: ${targetGlob}`);
  console.log(`FixMode: ${fix ? "enabled" : "disabled"}`);
  console.log("");

  const hasLintBin = (await $`which markdownlint-cli2`.quiet().nothrow()).exitCode === 0;

  // --- Phase 1: Standards (markdownlint-cli2) ---
  console.log("==> Phase 1: Standards (markdownlint-cli2)");
  console.log(`Config: ${lintConfigSource}`);

  if (fix) {
    console.log("Fix: applying auto-fixes first...");
    if (hasLintBin) {
      await $`markdownlint-cli2 ${configArg} --fix ${targetGlob}`.quiet().nothrow();
    } else {
      await $`npx -y markdownlint-cli2 ${configArg} --fix ${targetGlob}`.quiet().nothrow();
    }
  }

  let lintOut = "";
  if (hasLintBin) {
    lintOut = await $`markdownlint-cli2 ${configArg} ${targetGlob}`.quiet().nothrow().text();
  } else {
    lintOut = await $`npx -y markdownlint-cli2 ${configArg} ${targetGlob}`.quiet().nothrow().text();
  }

  const lintLines = lintOut.split("\n").filter((line) => /MD\d{3}/.test(line));
  const lintErrors = lintLines.length;

  if (lintErrors === 0) {
    console.log("Status: clean (0 issues)");
  } else {
    console.log(`Status: ${lintErrors} formatting issue(s) detected`);
    for (const line of lintLines) {
      console.log(`[LINT] ${line}`);
    }
  }
  console.log("");

  // --- Phase 2: Prose & AI-Tells (Vale) ---
  console.log("==> Phase 2: Prose & AI-Tells (Vale)");
  let valeErrors = 0;
  const hasVale = (await $`which vale`.quiet().nothrow()).exitCode === 0;

  if (hasVale) {
    console.log(`Config: ${valeConfigSource}`);
    console.log(`Styles: ${valeStyles}`);
    console.log(`MinAlert: ${minLevel}`);

    const valeOut = await $`vale ${valeConfigArg} --minAlertLevel=${minLevel} --output=line ${targetGlob}`
      .quiet()
      .nothrow()
      .text();

    const rawValeLines = valeOut
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    valeErrors = rawValeLines.length;
    if (valeErrors === 0) {
      console.log("Status: clean (0 prose/AI-tell issues)");
    } else {
      console.log(`Status: ${valeErrors} prose/AI-tell issue(s) flagged`);
      for (const line of rawValeLines) {
        console.log(`[VALE]  ${line}`);
      }
    }
  } else {
    console.log("Status: skipped (vale not installed - run 'brew install vale')");
  }
  console.log("");

  // Resolve target files for link checking, structure, security, and token density
  const matchedFiles = resolveFiles(targetGlob);

  // --- Phase 3: Link Integrity ---
  let totalBrokenLinks: BrokenLink[] = [];
  if (checkLinks) {
    console.log("==> Phase 3: Link Integrity");
    for (const f of matchedFiles) {
      if (existsSync(f) && statSync(f).isFile()) {
        const linkRes = checkMarkdownLinks(f);
        totalBrokenLinks.push(...linkRes.brokenLinks);
      }
    }
    if (totalBrokenLinks.length === 0) {
      console.log("Status: clean (0 broken links)");
    } else {
      console.log(`Status: ${totalBrokenLinks.length} broken link(s) detected`);
      for (const b of totalBrokenLinks) {
        console.log(`[LINK] ${b.file}:${b.line} -> '${b.rawTarget}' (${b.reason})`);
      }
    }
    console.log("");
  }

  // --- Phase 4: Document Structure (Depth & Orphans) ---
  let totalStructureIssues: Array<{ file: string; finding: StructureFinding }> = [];
  if (checkStructure) {
    console.log("==> Phase 4: Document Structure (Headings & Math)");
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
      console.log("Status: clean (0 structure/heading issues)");
    } else {
      console.log(`Status: ${totalStructureIssues.length} structure issue(s) detected`);
      for (const { file, finding } of totalStructureIssues) {
        console.log(`[STRUCT] ${file}:${finding.line} -> ${finding.reason}`);
      }
    }
    console.log("");
  }

  // --- Phase 5: Security & Credential Scanner ---
  let totalSecurityIssues: Array<{ file: string; finding: SecurityFinding }> = [];
  if (checkSecurity) {
    console.log("==> Phase 5: Security & Secret Leak Scanner");
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
      console.log("Status: clean (0 secret/placeholder leaks)");
    } else {
      console.log(`Status: ${totalSecurityIssues.length} security finding(s) detected`);
      for (const { file, finding } of totalSecurityIssues) {
        console.log(`[SECURITY] ${file}:${finding.line} -> ${finding.reason} ('${finding.match}')`);
      }
    }
    console.log("");
  }

  // --- Phase 6: Token Density & Context Efficiency ---
  const densityReports: Array<{ file: string; report: TokenDensityReport }> = [];
  if (checkDensity) {
    console.log("==> Phase 6: Token Density & AI Context Efficiency");
    for (const f of matchedFiles) {
      if (existsSync(f) && statSync(f).isFile()) {
        try {
          const content = readFileSync(f, "utf-8");
          const report = analyzeTokenDensity(content);
          densityReports.push({ file: f, report });
        } catch {}
      }
    }

    if (densityReports.length > 0) {
      for (const { file, report } of densityReports) {
        console.log(
          `• ${file}: ~${report.estimatedTokens} tokens (${report.wordCount} words) · Rating: ${report.densityRating}`,
        );
        if (report.fillerMatches.length > 0) {
          for (const fm of report.fillerMatches) {
            console.log(`  [DENSITY] line ${fm.line}: Filler detected '${fm.phrase}'`);
          }
        }
        if (report.condescendingMatches.length > 0) {
          for (const cm of report.condescendingMatches) {
            console.log(`  [TONE] line ${cm.line}: Presumptuous word '${cm.phrase}'`);
          }
        }
      }
    } else {
      console.log("Status: no files analyzed");
    }
    console.log("");
  }

  // --- Summary & Verdict ---
  const brokenLinksCount = totalBrokenLinks.length;
  const securityIssuesCount = totalSecurityIssues.length;
  const structureIssuesCount = totalStructureIssues.length;
  const totalErrors = lintErrors + valeErrors + brokenLinksCount + securityIssuesCount + structureIssuesCount;

  console.log("==> Summary");
  console.log(`Standards:        ${lintErrors} issue(s)`);
  console.log(`Prose/AI:         ${valeErrors} issue(s)`);
  console.log(`Link Errors:      ${brokenLinksCount} issue(s)`);
  console.log(`Structure Errors: ${structureIssuesCount} issue(s)`);
  console.log(`Security Leaks:   ${securityIssuesCount} issue(s)`);

  if (totalErrors === 0) {
    console.log("Verdict:          CLEAN");
    return {
      lintErrors,
      valeErrors,
      brokenLinksCount: 0,
      securityIssuesCount: 0,
      structureIssuesCount: 0,
      totalErrors: 0,
      densityReports,
      verdict: "CLEAN",
      exitCode: 0,
    };
  } else {
    console.log(`Verdict:          NEEDS_REVIEW (${totalErrors} total issues)`);
    return {
      lintErrors,
      valeErrors,
      brokenLinksCount,
      securityIssuesCount,
      structureIssuesCount,
      totalErrors,
      densityReports,
      verdict: "NEEDS_REVIEW",
      exitCode: 1,
    };
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  let glob = "**/*.md";
  let fix = false;
  let minLevel: "error" | "warning" | "suggestion" = "warning";
  let checkLinks = true;
  let checkDensity = true;
  let checkSecurity = true;
  let checkStructure = true;

  for (const arg of args) {
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
    } else if (arg.startsWith("--min-level=")) {
      const lvl = arg.split("=")[1];
      if (lvl === "error" || lvl === "warning" || lvl === "suggestion") {
        minLevel = lvl;
      }
    } else if (!arg.startsWith("-")) {
      glob = arg;
    }
  }

  const result = await runReview({
    glob,
    fix,
    minLevel,
    checkLinks,
    checkDensity,
    checkSecurity,
    checkStructure,
  });
  process.exit(result.exitCode);
}

#!/usr/bin/env bun
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type Finding, MISSING_MAIN_SECTION, validateSkill } from "./validate";

/** How one skill fares against the validator in default (non-strict) mode. */
export type SkillStatus =
  | { kind: "ok" }
  | { kind: "warnings"; count: number }
  /** The only finding is the missing main-section frame warning: an older skill shape. */
  | { kind: "legacy shape" }
  | { kind: "errors"; count: number };

export interface SkillResult {
  name: string;
  status: SkillStatus;
}

export interface Report {
  results: SkillResult[];
}

/** Names of authored skills: every non-hidden folder in the repo's skills directory, sorted. Throws when it cannot be read. */
export function authoredSkills(skillsDir: string): string[] {
  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort();
}

export function classify(findings: Finding[]): SkillStatus {
  const errors = findings.filter((f) => f.level === "error").length;
  if (errors > 0) return { kind: "errors", count: errors };
  if (findings.length === 0) return { kind: "ok" };
  if (findings.length === 1 && findings[0]?.message === MISSING_MAIN_SECTION) {
    return { kind: "legacy shape" };
  }
  return { kind: "warnings", count: findings.length };
}

export function renderStatus(status: SkillStatus): string {
  return status.kind === "warnings" || status.kind === "errors"
    ? `${status.kind} (${status.count})`
    : status.kind;
}

/** Validates each named skill folder under `skillsDir`. */
export function buildReport(names: string[], skillsDir: string): Report {
  const results = names.map((name) => {
    const skillDir = path.join(skillsDir, name);
    const findings = validateSkill(skillDir);
    return { name, status: classify(findings) };
  });
  return { results };
}

export function renderReport(report: Report): string[] {
  const lines = report.results.map((r) => `${r.name}: ${renderStatus(r.status)}`);
  const count = (kind: SkillStatus["kind"]): number =>
    report.results.filter((r) => r.status.kind === kind).length;
  lines.push(
    `${report.results.length} authored skills: ${count("ok")} ok, ${count("warnings")} warnings, ` +
      `${count("legacy shape")} legacy shape, ${count("errors")} errors`,
  );
  return lines;
}

const USAGE =
  "Usage: bun report.ts [--skills-dir <dir>]\n" +
  "Validates every authored skill, meaning every folder in the ai-custom repo's skills directory, in default mode. Read-only.\n" +
  "Default skills dir: $AI_CUSTOM_REPO/.agents/skills, else ~/Disk/ai-custom/.agents/skills.\n" +
  "Exits 1 when any skill has errors, 2 on bad arguments or an unreadable skills dir.";

function defaultSkillsDir(): string {
  const repo = process.env.AI_CUSTOM_REPO || path.join(os.homedir(), "Disk", "ai-custom");
  return path.join(repo, ".agents", "skills");
}

function main(argv: string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return 0;
  }
  let skillsDir = defaultSkillsDir();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag !== "--skills-dir" || value === undefined) {
      console.error(`report: unexpected argument '${flag}'${value === undefined ? " (missing value)" : ""}\n${USAGE}`);
      return 2;
    }
    skillsDir = path.resolve(value);
  }

  let names: string[];
  try {
    names = authoredSkills(skillsDir);
  } catch (error) {
    console.error(`report: cannot read skills dir ${skillsDir}: ${(error as Error).message}`);
    return 2;
  }
  const report = buildReport(names, skillsDir);
  for (const line of renderReport(report)) console.log(line);
  return report.results.some((r) => r.status.kind === "errors") ? 1 : 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));

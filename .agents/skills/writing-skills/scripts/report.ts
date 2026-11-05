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
  /** Authored skills in the manifest that have no folder under the skills directory. */
  missing: string[];
}

/** Names of authored skills under the `agents` skill root, in manifest order. Throws on a malformed manifest. */
export function authoredSkills(manifestText: string): string[] {
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    throw new Error(`manifest is not valid JSON: ${(error as Error).message}`);
  }
  const entries = (manifest as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries)) throw new Error("manifest has no `entries` array");
  const names: string[] = [];
  for (const entry of entries as Array<Record<string, unknown> | null>) {
    if (entry?.kind !== "skill" || entry.root !== "agents" || typeof entry.path !== "string") continue;
    const origin = (entry.skill as { origin?: unknown } | undefined)?.origin;
    if (origin === "authored") names.push(entry.path);
  }
  return names;
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

/** Validates each authored skill that has a folder in `skillsDir`; the rest are reported as missing. */
export function buildReport(names: string[], skillsDir: string): Report {
  const results: SkillResult[] = [];
  const missing: string[] = [];
  for (const name of names) {
    const dir = path.join(skillsDir, name);
    if (!fs.existsSync(dir)) missing.push(name);
    else results.push({ name, status: classify(validateSkill(dir)) });
  }
  return { results, missing };
}

export function renderReport(report: Report): string[] {
  const lines = report.results.map((r) => `${r.name}: ${renderStatus(r.status)}`);
  const count = (kind: SkillStatus["kind"]): number =>
    report.results.filter((r) => r.status.kind === kind).length;
  lines.push(
    `${report.results.length} authored skills: ${count("ok")} ok, ${count("warnings")} warnings, ` +
      `${count("legacy shape")} legacy shape, ${count("errors")} errors` +
      ` (${report.missing.length} without a local folder skipped)`,
  );
  return lines;
}

const USAGE =
  "Usage: bun report.ts [--manifest <file>] [--skills-dir <dir>]\n" +
  "Validates every authored skill listed in the ai-sync manifest, in default mode. Read-only.\n" +
  "Defaults: manifest $AI_CUSTOM_REPO/.ai-sync/manifest.json, else ~/Disk/ai-custom/.ai-sync/manifest.json;\n" +
  "skills dir ~/.agents/skills. Exits 1 when any skill has errors, 2 on bad arguments or manifest.";

function defaultManifest(): string {
  const repo = process.env.AI_CUSTOM_REPO || path.join(os.homedir(), "Disk", "ai-custom");
  return path.join(repo, ".ai-sync", "manifest.json");
}

function main(argv: string[]): number {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return 0;
  }
  let manifestPath = defaultManifest();
  let skillsDir = path.join(os.homedir(), ".agents", "skills");
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if ((flag !== "--manifest" && flag !== "--skills-dir") || value === undefined) {
      console.error(`report: unexpected argument '${flag}'${value === undefined ? " (missing value)" : ""}\n${USAGE}`);
      return 2;
    }
    if (flag === "--manifest") manifestPath = path.resolve(value);
    else skillsDir = path.resolve(value);
  }

  let names: string[];
  try {
    const manifestText = fs.readFileSync(manifestPath, "utf8");
    names = authoredSkills(manifestText);
  } catch (error) {
    console.error(`report: cannot use manifest ${manifestPath}: ${(error as Error).message}`);
    return 2;
  }
  const report = buildReport(names, skillsDir);
  for (const line of renderReport(report)) console.log(line);
  return report.results.some((r) => r.status.kind === "errors") ? 1 : 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));

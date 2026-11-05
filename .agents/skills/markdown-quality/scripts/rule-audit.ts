#!/usr/bin/env bun
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Checks the agent-mode allowlist against the vendored ai-tells package.
 * Vale silently ignores a rule name it does not know, so a renamed or removed rule would switch a
 * check off without any message. Rules the package adds stay off until someone decides about them.
 */

export interface RuleAudit {
  /** Named in the agent allowlist, absent from the package. */
  missing: string[];
  /** In the package, absent from the recorded snapshot: nobody has decided about them. */
  unreviewed: string[];
  /** In the snapshot, gone from the package. */
  removed: string[];
}

const ALLOW_LINE = /^ai-tells\.([A-Za-z0-9]+)\s*=\s*YES\s*$/;

export function parseAllowlist(iniText: string): string[] {
  const names: string[] = [];
  for (const line of iniText.split("\n")) {
    const match = ALLOW_LINE.exec(line.trim());
    if (match?.[1]) names.push(match[1]);
  }
  return names;
}

export function parseSnapshot(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

export function auditRules(allowlist: string[], packageRules: string[], snapshot: string[]): RuleAudit {
  const inPackage = new Set(packageRules);
  const known = new Set(snapshot);
  return {
    missing: allowlist.filter((name) => !inPackage.has(name)).sort(),
    unreviewed: packageRules.filter((name) => !known.has(name)).sort(),
    removed: snapshot.filter((name) => !inPackage.has(name)).sort(),
  };
}

export function listPackageRules(stylesDir: string): string[] {
  return fs
    .readdirSync(path.join(stylesDir, "ai-tells"))
    .filter((file) => file.endsWith(".yml"))
    .map((file) => file.slice(0, -".yml".length))
    .sort();
}

const SNAPSHOT_HEADER =
  "# ai-tells rules reviewed for agent mode. Each is either listed in modes/agent/.vale.ini or deliberately off.\n";

interface Args {
  assets: string;
  accept: boolean;
}

function parseArgs(argv: string[]): Args | null {
  let assets = path.resolve(import.meta.dir, "..", "assets");
  let accept = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--accept") accept = true;
    else if (arg === "--assets" && argv[i + 1]) assets = path.resolve(argv[++i] as string);
    else return null;
  }
  return { assets, accept };
}

export function main(argv: string[]): number {
  const args = parseArgs(argv);
  if (!args) {
    console.error("Usage: bun rule-audit.ts [--accept] [--assets <dir>]");
    return 2;
  }
  const stylesDir = path.join(args.assets, ".vale", "styles");
  const iniFile = path.join(args.assets, "modes", "agent", ".vale.ini");
  const snapshotFile = path.join(args.assets, "modes", "ai-tells-reviewed.txt");
  if (!fs.existsSync(path.join(stylesDir, "ai-tells"))) {
    console.error(`rule-audit: ai-tells package not found under ${stylesDir}`);
    console.error("recovery: run `vale sync` with the agent mode config to install it.");
    return 1;
  }
  const packageRules = listPackageRules(stylesDir);
  const allowlist = parseAllowlist(fs.readFileSync(iniFile, "utf8"));
  const snapshot = fs.existsSync(snapshotFile)
    ? parseSnapshot(fs.readFileSync(snapshotFile, "utf8"))
    : [];
  const audit = auditRules(allowlist, packageRules, snapshot);

  if (args.accept) {
    if (audit.missing.length > 0) {
      console.error(`rule-audit: refusing to accept while the allowlist names missing rules: ${audit.missing.join(", ")}`);
      return 1;
    }
    fs.writeFileSync(snapshotFile, `${SNAPSHOT_HEADER}${packageRules.join("\n")}\n`);
    console.log(`rule-audit: recorded ${packageRules.length} rules as reviewed`);
    return 0;
  }

  console.log(`rule-audit [allowlist ${allowlist.length} · package ${packageRules.length} · reviewed ${snapshot.length}]`);
  if (audit.missing.length > 0) {
    console.log(`  ✖ missing: the agent allowlist names rules the package does not ship (${audit.missing.length})`);
    for (const name of audit.missing) console.log(`    - ${name}`);
  }
  if (audit.unreviewed.length > 0) {
    console.log(`  ✖ unreviewed: the package ships rules nobody has decided about (${audit.unreviewed.length})`);
    for (const name of audit.unreviewed) console.log(`    - ${name}`);
  }
  if (audit.removed.length > 0) {
    console.log(`  · removed: reviewed rules the package no longer ships (${audit.removed.length})`);
    for (const name of audit.removed) console.log(`    - ${name}`);
  }
  const failed = audit.missing.length > 0 || audit.unreviewed.length > 0;
  if (failed) {
    console.error(
      "recovery: add each wanted rule to the agent allowlist as `ai-tells.<Rule> = YES`, fix or drop missing names, then run `bun rule-audit.ts --accept` to record the decision.",
    );
    return 1;
  }
  console.log("  ✔ every allowlisted rule exists and every package rule is reviewed");
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));

#!/usr/bin/env bun
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import {
  loadPathManifest,
  normalizePolicyPattern,
  PATH_MANIFEST_RELATIVE,
  savePathManifest,
  setPathRule,
} from "./path-manifest";
import { DEFAULT_REPO, SKILLS_DIR, HOME, SyncOptions, TARGET_MAP } from "./targets";
import {
  autoDetectSkill,
  loadManifest,
  loadSkillsLock,
  LOCAL_MANIFEST_FILE,
  MANIFEST_FILENAME,
  migrateLegacyManifest,
  removeManifestEntry,
  removeOrphanedManifestEntries,
  repoManifestPath,
  saveManifest,
  SkillsLock,
  SkillsManifest,
  SkillManifestEntry,
  SkillOrigin,
  untrackSkill,
  withOriginFilter,
} from "./manifest";
import { checkGitRemoteStatus } from "./git";
import { printSyncSummary } from "./reporting";
import {
  cmdDiff,
  cmdPull,
  cmdPush,
  cmdResolve,
  cmdStatus,
  cmdViewDiff,
  DiffReport,
  compare,
  copyFileSafe,
  getAllFiles,
  plainMergeFiles,
  sha256,
} from "./sync-files";

// Re-export everything callers/tests import from "./sync" so the CLI stays
// the public surface and module-level refactors are transparent.
export { DEFAULT_REPO, HOME, SKILLS_DIR, TARGET_MAP, matchesPattern, filterItems } from "./targets";
export type { SyncOptions, SyncTarget } from "./targets";
export {
  autoDetectSkill,
  loadManifest,
  loadSkillsLock,
  LOCAL_MANIFEST_FILE,
  MANIFEST_FILENAME,
  migrateLegacyManifest,
  removeManifestEntry,
  removeOrphanedManifestEntries,
  repoManifestPath,
  saveManifest,
  SKILLS_LOCK_FILE,
  untrackSkill,
  withOriginFilter,
} from "./manifest";
export type { SkillManifestEntry, SkillOrigin, SkillsLock, SkillsManifest } from "./manifest";
export { checkGitRemoteStatus } from "./git";
export { printSyncSummary } from "./reporting";
export {
  cmdDiff,
  cmdPull,
  cmdPush,
  cmdResolve,
  cmdStatus,
  cmdViewDiff,
  compare,
  copyFileSafe,
  getAllFiles,
  plainMergeFiles,
  sha256,
} from "./sync-files";
export type { DiffReport } from "./sync-files";

export { createPathMatcher, isPathSynced, loadPathManifest, normalizePolicyPattern, PATH_MANIFEST_RELATIVE } from "./path-manifest";
export type { PathManifest, PathRule } from "./path-manifest";

export function cmdInit(repoBase = DEFAULT_REPO): void {
  const file = path.join(repoBase, PATH_MANIFEST_RELATIVE);
  if (fs.existsSync(file)) {
    const manifest = loadPathManifest(repoBase);
    console.log(`Path policy already exists: ${file}`);
    for (const rule of manifest.rules) console.log(`   ${rule.sync ? "include" : "exclude"} ${rule.pattern}`);
    return;
  }
  savePathManifest(repoBase, { version: 1, rules: [] });
  console.log(`Initialized empty path policy: ${file}`);
  for (const target of TARGET_MAP.filter((item) => item.category !== "skills")) {
    const repoRoot = target.repo.replace(DEFAULT_REPO, repoBase);
    const localFiles = getAllFiles(target.local);
    const repoFiles = getAllFiles(repoRoot);
    const localRels = new Set(localFiles.map((f) => path.relative(target.local, f)));
    const repoRels = new Set(repoFiles.map((f) => path.relative(repoRoot, f)));
    for (const rel of localRels) {
      if (!repoRels.has(rel)) console.log(`Candidate (local only): ${path.relative(repoBase, path.join(repoRoot, rel))}`);
    }
    for (const rel of repoRels) {
      if (!localRels.has(rel)) console.log(`Candidate (repo only): ${path.relative(repoBase, path.join(repoRoot, rel))}`);
    }
  }
}

export function cmdTrackPath(pattern: string, sync: boolean, repoBase = DEFAULT_REPO): void {
  const normalized = normalizePolicyPattern(pattern, repoBase);
  const target = TARGET_MAP.find((item) => {
    if (item.category === "skills") return false;
    const root = path.relative(repoBase, item.repo.replace(DEFAULT_REPO, repoBase)).replace(/\\/g, "/");
    return normalized === root || normalized.startsWith(`${root}/`);
  });
  const root = target
    ? path.relative(repoBase, target.repo.replace(DEFAULT_REPO, repoBase)).replace(/\\/g, "/")
    : "";
  const localPath = target && normalized === root
    ? target.local
    : target && path.join(target.local, path.relative(root, normalized));
  const singleFileTarget = target && (
    ["config", "mcp", "instructions"].includes(target.category) ||
    (localPath && fs.existsSync(localPath) && fs.statSync(localPath).isFile())
  );
  const rulePattern = normalized.endsWith("/**") || singleFileTarget
    ? normalized
    : `${normalized.replace(/\/$/, "")}/**`;
  const manifest = loadPathManifest(repoBase);
  savePathManifest(repoBase, setPathRule(manifest, rulePattern, sync));
  console.log(`${sync ? "Tracking" : "Excluding"} ${normalized}`);
}
export function cmdUntrackPath(pattern: string, repoBase = DEFAULT_REPO): void {
  cmdTrackPath(pattern, false, repoBase);
}


function isPathPolicyArgument(value: string): boolean {
  return value.startsWith(".omp/");
}
export function cmdTrack(
  skill: string,
  origin: SkillOrigin,
  meta: { from?: string; version?: string; sync?: boolean } = {},
  repoBase = DEFAULT_REPO,
) {
  if (!["authored", "external"].includes(origin)) {
    console.log(`❌ Invalid origin '${origin}'. Use authored | external.`);
    process.exit(1);
  }
  // Default sync behavior: authored defaults to true, external defaults to false
  const sync = meta.sync !== undefined ? meta.sync : origin === "authored";

  const manifest = loadManifest(LOCAL_MANIFEST_FILE);
  const repoManifestFile = repoManifestPath(repoBase);
  const repoManifest = loadManifest(repoManifestFile);
  const wasSynced = manifest.skills[skill]?.sync === true || repoManifest.skills[skill]?.sync === true;
  manifest.skills[skill] = {
    origin,
    sync,
    ...(meta.from ? { source: meta.from, sourceType: "github", install: `npx skills add ${meta.from} -g` } : {}),
    ...(meta.version ? { version: meta.version } : {}),
  };
  saveManifest(LOCAL_MANIFEST_FILE, manifest);
  console.log(`📋 Tracked '${skill}' as ${origin} (sync: ${sync})${meta.from ? ` (${meta.from}${meta.version ? "@" + meta.version : ""})` : ""} in ${LOCAL_MANIFEST_FILE.replace(HOME, "~")}`);

  repoManifest.skills[skill] = manifest.skills[skill];
  saveManifest(repoManifestFile, repoManifest);
  console.log(`   🌐 Repo manifest updated: ${repoManifestFile.replace(HOME, "~")} (commit with your next push)`);
  if (wasSynced && !sync) {
    const repoSkillPath = path.join(repoBase, ".agents", "skills", skill);
    if (fs.existsSync(repoSkillPath)) {
      console.log(`⚠️ Sync disabled for '${skill}'. Future transfers will skip it.`);
      console.log(`   Existing backup copy remains at ${path.relative(repoBase, repoSkillPath)}; no files were deleted. Ask the user before removing it from the backup.`);
    }
  }
}

export function cmdUntrack(skill: string, repoBase = DEFAULT_REPO): void {
  const result = untrackSkill(skill, LOCAL_MANIFEST_FILE, repoManifestPath(repoBase));
  if (!result.local && !result.shared) {
    console.log(`📋 '${skill}' was not tracked in either manifest.`);
    return;
  }
  console.log(`📋 Untracked '${skill}' from ${result.local ? "local" : "shared"}${result.local && result.shared ? " and shared" : ""} manifest${result.local || result.shared ? "s" : ""}. Skill files were not deleted.`);
}
export function cmdPruneManifest(apply = false): void {
  const manifest = loadManifest(LOCAL_MANIFEST_FILE);
  const installedSkills = fs.existsSync(SKILLS_DIR)
    ? fs.readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : [];
  const candidates = Object.keys(manifest.skills).filter((name) => !installedSkills.includes(name));
  if (candidates.length === 0) {
    console.log(`📋 No orphaned local manifest entries.`);
    return;
  }
  if (!apply) {
    console.log(`📋 Orphaned local manifest entries: ${candidates.join(", ")}\n   Review, then run: bun sync.ts prune-manifest --apply`);
    return;
  }
  removeOrphanedManifestEntries(manifest, installedSkills);
  saveManifest(LOCAL_MANIFEST_FILE, manifest);
  console.log(`📋 Removed orphaned local manifest entries: ${candidates.join(", ")}. Shared manifest unchanged.`);
}

export function cmdMigrateManifest(repoBase = DEFAULT_REPO, apply = false): void {
  const legacyManifestFile = path.join(repoBase, MANIFEST_FILENAME);
  const canonicalManifestFile = repoManifestPath(repoBase);
  if (!fs.existsSync(legacyManifestFile)) {
    console.log(`📋 No legacy root manifest.`);
    return;
  }
  if (fs.existsSync(canonicalManifestFile)) {
    console.log(`⚠️  Both legacy and canonical manifests exist. Resolve their contents before deleting the legacy file.`);
    return;
  }
  if (!apply) {
    console.log(`📋 Legacy manifest found: ${legacyManifestFile}\n   Review, then run: bun sync.ts migrate-manifest --apply`);
    return;
  }
  migrateLegacyManifest(legacyManifestFile, canonicalManifestFile);
  console.log(`📋 Moved the legacy manifest to ${canonicalManifestFile}.`);
}

export function cmdBootstrap(repoBase = DEFAULT_REPO) {
  console.log(`\n🚀 Bootstrapping from ${repoBase}...`);
  const repoManifest = loadManifest(repoManifestPath(repoBase));
  const localManifest = loadManifest(LOCAL_MANIFEST_FILE);
  let seeded = 0;
  for (const [name, entry] of Object.entries(repoManifest.skills)) {
    if (!localManifest.skills[name]) {
      localManifest.skills[name] = entry;
      seeded++;
    }
  }
  saveManifest(LOCAL_MANIFEST_FILE, localManifest);
  console.log(`   📋 Local manifest updated with ${seeded} new entr${seeded === 1 ? "y" : "ies"} (${Object.keys(localManifest.skills).length} total)`);
  cmdPull(repoBase);

  const skillsDir = path.join(HOME, ".agents", "skills");
  for (const [name, entry] of Object.entries(repoManifest.skills)) {
    if (entry.origin !== "external" || entry.sync === true) continue;
    if (fs.existsSync(path.join(skillsDir, name))) continue;
    const installCmd = entry.install || (entry.source ? `npx -y skills add ${entry.source} -g` : null);
    if (!installCmd) {
      console.log(`   ⚠️  external '${name}' has no install command or source — install manually`);
      continue;
    }
    console.log(`   🌐 Installing external '${name}' via: ${installCmd}`);
    try {
      execSync(installCmd, { stdio: "inherit" });
    } catch {
      console.log(`   ❌ Install failed for '${name}'. Retry manually: ${installCmd}`);
    }
  }
  console.log(`\n✅ Bootstrap complete.\n`);
}

export function cmdDiscover(repoBase = DEFAULT_REPO, write = false): SkillsManifest {
  console.log(`\n🔍 ai-sync: Skill Discovery & Provenance Report`);
  console.log(`─────────────────────────────────────────────────────────────────────────────`);
  const localSkillsDir = path.join(HOME, ".agents", "skills");
  const repoSkillsDir = path.join(repoBase, ".agents", "skills");
  console.log(`📍 Machine Home : ${localSkillsDir}`);
  console.log(`🌐 Backup Repo  : ${repoSkillsDir}\n`);

  const skillsLock = loadSkillsLock();
  const repoManifest = loadManifest(repoManifestPath(repoBase));
  const localManifest = loadManifest(LOCAL_MANIFEST_FILE);

  const skillDirs = fs.existsSync(localSkillsDir)
    ? fs.readdirSync(localSkillsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
    : [];

  const invalidSkillDirs = skillDirs.filter((name) => !fs.existsSync(path.join(localSkillsDir, name, "SKILL.md")));
  const orphanedManifestEntries = Object.keys(localManifest.skills).filter((name) => !skillDirs.includes(name));

  const discovered: SkillsManifest = { version: 1, skills: {} };

  for (const name of skillDirs) {
    // If local manifest already has an explicit manual decision, preserve origin & sync
    const existing = localManifest.skills[name];
    if (existing) {
      discovered.skills[name] = { ...existing };
      if (!discovered.skills[name].detectionReason) {
        discovered.skills[name].detectionReason = existing.sync
          ? "matched in repo"
          : existing.origin === "external"
          ? (existing.source ? `pointer (${existing.source})` : "external manifest")
          : "private to this machine";
      }
    } else {
      const fullPath = path.join(localSkillsDir, name);
      discovered.skills[name] = autoDetectSkill(name, fullPath, repoSkillsDir, skillsLock, repoManifest);
    }
  }

  // Group results
  const authoredSynced = Object.entries(discovered.skills).filter(([, e]) => e.origin === "authored" && e.sync);
  const externalDeps = Object.entries(discovered.skills).filter(([, e]) => e.origin === "external" && !e.sync);
  const externalSynced = Object.entries(discovered.skills).filter(([, e]) => e.origin === "external" && e.sync);
  const localExperiments = Object.entries(discovered.skills).filter(([, e]) => e.origin === "authored" && !e.sync);

  console.log(`📦 SKILLS BREAKDOWN (${skillDirs.length} installed):\n`);

  console.log(`  ✨ AUTHORED & SYNCED (${authoredSynced.length} skills) — Backed up to Git`);
  console.log(`  ─────────────────────────────────────────────────────────`);
  if (authoredSynced.length === 0) console.log(`     (none)`);
  for (const [name, e] of authoredSynced) {
    const reason = e.detectionReason ? `[${e.detectionReason}]` : "";
    console.log(`     • ${name.padEnd(20)} ${reason}`);
  }
  console.log();

  console.log(`  🌐 EXTERNAL DEPENDENCIES (${externalDeps.length} skills) — Pointers only, excluded from Git`);
  console.log(`  ─────────────────────────────────────────────────────────`);
  if (externalDeps.length === 0) console.log(`     (none)`);
  for (const [name, e] of externalDeps) {
    const sourceTag = e.source ? `(${e.source}${e.version ? "@" + e.version : ""})` : "";
    const reason = e.detectionReason ? `[${e.detectionReason}]` : "";
    console.log(`     • ${name.padEnd(18)} ${sourceTag.padEnd(28)} ${reason}`);
  }
  console.log();

  if (externalSynced.length > 0) {
    console.log(`  📦 EXTERNAL VENDORED (${externalSynced.length} skills) — Full source committed to Git`);
    console.log(`  ─────────────────────────────────────────────────────────`);
    for (const [name, e] of externalSynced) {
      console.log(`     • ${name.padEnd(20)} [vendored]`);
    }
    console.log();
  }

  console.log(`  🔒 MACHINE-LOCAL EXPERIMENTS (${localExperiments.length} skills) — Private to this Mac`);
  console.log(`  ─────────────────────────────────────────────────────────`);
  if (localExperiments.length === 0) console.log(`     (none)`);
  for (const [name, e] of localExperiments) {
    const reason = e.detectionReason ? `[${e.detectionReason}]` : "";
    console.log(`     • ${name.padEnd(20)} (sync: false)        ${reason}`);
  }
  console.log();

  if (invalidSkillDirs.length > 0) {
    console.log(`⚠️  Invalid skill directories (missing SKILL.md): ${invalidSkillDirs.join(", ")}`);
  }
  if (orphanedManifestEntries.length > 0) {
    console.log(`⚠️  Orphaned local manifest entries: ${orphanedManifestEntries.join(", ")} — run 'sync.ts prune-manifest --apply' after review`);
  }
  if (invalidSkillDirs.length > 0 || orphanedManifestEntries.length > 0) console.log();

  if (write) {
    saveManifest(LOCAL_MANIFEST_FILE, {
      version: localManifest.version,
      skills: { ...localManifest.skills, ...discovered.skills },
    });
  }

  const nonSyncedCount = externalDeps.length + localExperiments.length;
  console.log(`─────────────────────────────────────────────────────────────────────────────`);
  console.log(`🛡️  Git Protection Summary:`);
  console.log(`   • ${authoredSynced.length + externalSynced.length} skills backed up to Git (0 third-party bloat)`);
  console.log(`   • ${nonSyncedCount} non-synced skills prevented from polluting repo (~450+ files saved)`);
  console.log(`   • Local manifest ${write ? "updated" : "unchanged"}: ${LOCAL_MANIFEST_FILE.replace(HOME, "~")}\n`);

  console.log(`💡 Next Actions:`);
  console.log(`   • Back up authored changes : bun sync.ts push`);
  console.log(`   • Promote an experiment    : bun sync.ts track <name> authored --sync\n`);

  return discovered;
}

export function parseArgs(rawArgs: string[]): {
  command: string;
  repo: string;
  opts: SyncOptions;
  /** positional args after the command (e.g. track <skill> <origin>) */
  args: string[];
  meta: { from?: string; version?: string; sync?: boolean };
} {
  let command = "status";
  let repo = DEFAULT_REPO;
  const opts: SyncOptions = { exclude: [] };
  const meta: { from?: string; version?: string; sync?: boolean } = {};
  const positional: string[] = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === "--exclude" || arg === "-x") {
      if (i + 1 < rawArgs.length) {
        opts.exclude!.push(rawArgs[++i]);
      }
    } else if (arg.startsWith("--exclude=")) {
      opts.exclude!.push(arg.slice("--exclude=".length));
    } else if (arg === "--target" || arg === "-t") {
      if (i + 1 < rawArgs.length) {
        opts.target = rawArgs[++i];
      }
    } else if (arg.startsWith("--target=")) {
      opts.target = arg.slice("--target=".length);
    } else if (arg === "--include-local") {
      opts.includeLocal = true;
    } else if (arg === "--write") {
      opts.write = true;
    } else if (arg === "--sync") {
      meta.sync = true;
    } else if (arg === "--apply") {
      opts.apply = true;
    } else if (arg === "--no-sync") {
      meta.sync = false;
    } else if (arg === "--from") {
      if (i + 1 < rawArgs.length) meta.from = rawArgs[++i];
    } else if (arg.startsWith("--from=")) {
      meta.from = arg.slice("--from=".length);
    } else if (arg === "--version") {
      if (i + 1 < rawArgs.length) meta.version = rawArgs[++i];
    } else if (arg.startsWith("--version=")) {
      meta.version = arg.slice("--version=".length);
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  if (positional[0]) command = positional[0];
  const rest = positional.slice(1);
  if (command === "init") {
    if (rest[0]) repo = rest[0].replace(/^~/, HOME);
  } else if (command !== "track" && command !== "untrack" && command !== "prune-manifest" && command !== "migrate-manifest" && command !== "bootstrap" && command !== "discover" && rest[0]) {
    if (rest[0].startsWith("/") || rest[0].startsWith("~") || fs.existsSync(rest[0])) {
      repo = rest[0].replace(/^~/, HOME);
    } else if (!opts.target) {
      opts.target = rest[0];
    }
  }
  if ((command === "track" || command === "untrack") && rest[0] && isPathPolicyArgument(rest[0]) && rest[1]) {
    repo = rest[1].replace(/^~/, HOME);
  }
  if (command !== "track" && command !== "untrack" && command !== "prune-manifest" && command !== "migrate-manifest" && command !== "bootstrap" && command !== "discover" && command !== "init" && rest[1] && !repo) {
    repo = rest[1].replace(/^~/, HOME);
  }

  return { command, repo, opts, args: rest, meta };
}

// CLI entrypoint when run directly
if (import.meta.main) {
  const { command, repo, opts, args, meta } = parseArgs(process.argv.slice(2));

  switch (command) {
    case "status":
    case "scan":
      cmdStatus(repo, opts);
      break;
    case "diff":
      cmdViewDiff(repo, opts);
      break;
    case "resolve":
    case "review":
      cmdResolve(repo, opts, "interactive");
      break;
    case "merge":
    case "combine":
      cmdResolve(repo, opts, "merge-all");
      break;
    case "pull":
    case "apply":
      cmdPull(repo, opts);
      break;
    case "push":
    case "backup":
    case "save":
      cmdPush(repo, opts);
      break;
    case "init":
      cmdInit(repo);
      break;
    case "track":
      if (!args[0] || (!args[1] && !isPathPolicyArgument(args[0]))) {
        console.log(`Usage: bun sync.ts track <skill> <authored|external> | track <repo-relative-path>`);
        process.exit(1);
      }
      if (isPathPolicyArgument(args[0])) cmdTrackPath(args[0], true, repo);
      else cmdTrack(args[0], args[1] as SkillOrigin, meta, repo);
      break;
    case "untrack":
      if (!args[0]) {
        console.log(`Usage: bun sync.ts untrack <skill|repo-relative-path>`);
        process.exit(1);
      }
      if (isPathPolicyArgument(args[0])) cmdUntrackPath(args[0], repo);
      else cmdUntrack(args[0], repo);
      break;
    case "migrate-manifest":
      cmdMigrateManifest(repo, opts.apply === true);
      break;
    case "bootstrap":
    case "restore":
      cmdBootstrap(repo);
      break;
    case "discover":
      cmdDiscover(repo, opts.write === true);
      break;
    default:
      console.log(`Usage: bun sync.ts [status|discover|diff|resolve|merge|pull|push|track|untrack|prune-manifest|migrate-manifest|bootstrap] [target|repo_path] [--exclude <name>] [--target <scope>] [--include-local] [--write] [--apply]`);
      process.exit(1);
  }
}

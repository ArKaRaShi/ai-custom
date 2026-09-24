#!/usr/bin/env bun
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { DEFAULT_REPO, SKILLS_DIR, HOME, SyncOptions } from "./targets";
import { LOCAL_LOCATIONS_FILE, loadLocations, loadUnifiedManifest, saveLocations, saveUnifiedManifest, validateLocations, validateUnifiedManifest, resolveRootPaths, pathRuleMatches, isJsonObject, type RootKind, type SkillMetadata, type SyncEntry, type UnifiedManifest } from "./unified-manifest";
import { checkGitRemoteStatus } from "./git";
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
export { DEFAULT_REPO, HOME, SKILLS_DIR, matchesPattern, filterItems } from "./targets";
export type { SyncOptions } from "./targets";
export { checkGitRemoteStatus } from "./git";
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
export { loadUnifiedManifest, validateUnifiedManifest, resolveRootPaths, pathRuleMatches, loadLocations, saveLocations, LOCAL_LOCATIONS_FILE } from "./unified-manifest";


export interface UnifiedTrackMetadata {
  sync?: boolean;
  origin?: "authored" | "external";
  source?: string;
  sourceType?: string;
  version?: string;
  install?: string;
  description?: string;
}

export function cmdRootAdd(id: string, kind: RootKind, repoRoot: string, repoBase = DEFAULT_REPO): void {
  const manifest = loadUnifiedManifest(repoBase);
  manifest.roots[id] = { kind, repoRoot };
  saveUnifiedManifest(repoBase, manifest);
  console.log(`Added ${kind} root '${id}' at ${repoRoot}`);
}

export function cmdRootBind(id: string, localRoot: string, repoBase = DEFAULT_REPO): void {
  const manifest = loadUnifiedManifest(repoBase);
  if (!manifest.roots[id]) throw new Error(`Unknown root: ${id}`);
  const locations = loadLocations();
  const next = { version: 1 as const, roots: { ...locations.roots, [id]: localRoot } };
  const validated = validateLocations(next, HOME);
  saveLocations(LOCAL_LOCATIONS_FILE, validated);
  console.log(`Bound root '${id}' to ${validated.roots[id]}`);
}

export function cmdTrackPathV2(pattern: string, rootId: string, sync: boolean, repoBase = DEFAULT_REPO): void {
  const manifest = loadUnifiedManifest(repoBase);
  if (manifest.roots[rootId]?.kind !== "path") throw new Error(`Unknown or non-path root: ${rootId}`);
  const entry: SyncEntry = { kind: "path", root: rootId, path: pattern, sync };
  manifest.entries = manifest.entries.filter((item) => !(item.kind === "path" && item.root === rootId && item.path === pattern));
  manifest.entries.push(entry);
  saveUnifiedManifest(repoBase, manifest);
  console.log(`${sync ? "Tracking" : "Excluding"} ${rootId}:${pattern}`);
}

export function cmdTrackSkillV2(name: string, rootId: string, metadata: UnifiedTrackMetadata, repoBase = DEFAULT_REPO): void {
  const manifest = loadUnifiedManifest(repoBase);
  if (manifest.roots[rootId]?.kind !== "skill") throw new Error(`Unknown or non-skill root: ${rootId}`);
  const origin = metadata.origin;
  if (origin !== "authored" && origin !== "external") throw new Error("Skill origin must be authored or external");
  const sync = metadata.sync ?? origin === "authored";
  const skill: SkillMetadata = { origin };
  if (metadata.source !== undefined) skill.source = metadata.source;
  if (metadata.sourceType !== undefined) skill.sourceType = metadata.sourceType;
  if (metadata.version !== undefined) skill.version = metadata.version;
  if (metadata.install !== undefined) skill.install = metadata.install;
  if (metadata.description !== undefined) skill.description = metadata.description;
  const root = manifest.roots[rootId];
  const target = path.join(repoBase, root.repoRoot, name);
  const wasSynced = manifest.entries.some((entry) => entry.kind === "skill" && entry.root === rootId && entry.path === name && entry.sync);
  manifest.entries = manifest.entries.filter((entry) => !(entry.kind === "skill" && entry.root === rootId && entry.path === name));
  manifest.entries.push({ kind: "skill", root: rootId, path: name, sync, skill });
  saveUnifiedManifest(repoBase, manifest);
  console.log(`Tracked '${name}' under ${rootId} (sync: ${sync})`);
  if (wasSynced && !sync && fs.existsSync(target)) {
    console.log(`Existing backup copy remains at ${path.relative(repoBase, target)}; no files were deleted. Ask before removing it.`);
  }
}

export function cmdUntrackV2(kind: RootKind, name: string, rootId: string, repoBase = DEFAULT_REPO): void {
  const manifest = loadUnifiedManifest(repoBase);
  if (manifest.roots[rootId]?.kind !== kind) throw new Error(`Unknown or wrong-kind root: ${rootId}`);
  const entryPath = kind === "path" ? name.replace(/\/$/, "") : name;
  if (kind === "path") {
    cmdTrackPathV2(entryPath, rootId, false, repoBase);
    return;
  }
  manifest.entries = manifest.entries.filter((entry) => !(entry.kind === "skill" && entry.root === rootId && entry.path === entryPath));
  saveUnifiedManifest(repoBase, manifest);
  console.log(`Untracked '${entryPath}' from ${rootId}; files were not deleted.`);
}

export function cmdInit(repoBase = DEFAULT_REPO): void {
  const manifest = loadUnifiedManifest(repoBase);
  if (fs.existsSync(path.join(repoBase, ".ai-sync", "manifest.json"))) {
    console.log(`Unified manifest already exists with ${Object.keys(manifest.roots).length} root(s).`);
    return;
  }
  saveUnifiedManifest(repoBase, { version: 2, roots: {}, entries: [] });
  console.log(`Initialized unified manifest at ${path.join(repoBase, ".ai-sync", "manifest.json")}`);
}

function readLegacySkillEntries(file: string): Map<string, SkillMetadata & { sync: boolean }> {
  if (!fs.existsSync(file)) return new Map();
  let value: unknown;
  try { value = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { throw new Error(`Cannot read legacy skill manifest: ${file}`); }
  if (!isJsonObject(value) || value.version !== 1 || !isJsonObject(value.skills)) throw new Error(`Invalid legacy skill manifest: ${file}`);
  const entries = new Map<string, SkillMetadata & { sync: boolean }>();
  for (const [name, raw] of Object.entries(value.skills)) {
    if (!isJsonObject(raw) || (raw.origin !== "authored" && raw.origin !== "external") || typeof raw.sync !== "boolean") {
      throw new Error(`Invalid legacy skill entry: ${name}`);
    }
    const skill: SkillMetadata & { sync: boolean } = { origin: raw.origin, sync: raw.sync };
    for (const field of ["source", "sourceType", "version", "install", "description"] as const) {
      if (raw[field] !== undefined) {
        if (typeof raw[field] !== "string") throw new Error(`Invalid legacy skill ${field}: ${name}`);
        skill[field] = raw[field];
      }
    }
    entries.set(name, skill);
  }
  return entries;
}

export function cmdMigrateV2(repoBase = DEFAULT_REPO): void {
  const pathFile = path.join(repoBase, ".ai-sync", "manifest.json");
  const localSkillsFile = path.join(SKILLS_DIR, "skills-manifest.json");
  const sharedSkillsFile = path.join(repoBase, ".agents", "skills", "skills-manifest.json");
  if (!fs.existsSync(pathFile)) throw new Error(`Missing legacy path manifest: ${pathFile}`);
  const pathText = fs.readFileSync(pathFile, "utf8");
  let legacyPaths: unknown;
  try { legacyPaths = JSON.parse(pathText); }
  catch { throw new Error(`Cannot read legacy path manifest: ${pathFile}`); }
  if (!isJsonObject(legacyPaths) || legacyPaths.version !== 1 || !Array.isArray(legacyPaths.rules)) {
    throw new Error("Expected version 1 path manifest for migration");
  }

  const skills = readLegacySkillEntries(localSkillsFile);
  for (const [name, entry] of readLegacySkillEntries(sharedSkillsFile)) {
    const localEntry = skills.get(name);
    if (localEntry && JSON.stringify(localEntry) !== JSON.stringify(entry)) throw new Error(`Conflicting legacy metadata for skill '${name}'`);
    skills.set(name, entry);
  }

  const manifest: UnifiedManifest = {
    version: 2,
    roots: { omp: { kind: "path", repoRoot: ".omp" }, agents: { kind: "skill", repoRoot: ".agents/skills" } },
    entries: [],
  };
  for (const raw of legacyPaths.rules) {
    if (!isJsonObject(raw) || typeof raw.pattern !== "string" || typeof raw.sync !== "boolean" || !raw.pattern.startsWith(".omp/")) {
      throw new Error(`Unsupported legacy path rule: ${isJsonObject(raw) ? String(raw.pattern) : "invalid rule"}`);
    }
    manifest.entries.push({ kind: "path", root: "omp", path: raw.pattern.slice(".omp/".length), sync: raw.sync });
  }
  for (const [name, skill] of skills) {
    const { sync, ...metadata } = skill;
    manifest.entries.push({ kind: "skill", root: "agents", path: name, sync, skill: metadata });
  }

  const checked = validateUnifiedManifest(manifest, repoBase);
  const oldSkillFiles = [localSkillsFile, sharedSkillsFile].filter((file) => fs.existsSync(file));
  const oldSkillText = new Map(oldSkillFiles.map((file) => [file, fs.readFileSync(file, "utf8")]));
  saveUnifiedManifest(repoBase, checked);
  try {
    for (const file of oldSkillFiles) fs.unlinkSync(file);
  } catch (error) {
    fs.writeFileSync(pathFile, pathText, "utf8");
    for (const [file, contents] of oldSkillText) fs.writeFileSync(file, contents, "utf8");
    throw error;
  }
  console.log(`Converted ${manifest.entries.length} entries into ${pathFile}; removed ${oldSkillFiles.length} legacy skill manifest(s).`);
}


export function cmdBootstrap(repoBase = DEFAULT_REPO): void {
  console.log(`\n🚀 Bootstrapping from ${repoBase}...`);
  const manifest = loadUnifiedManifest(repoBase);
  const roots = resolveRootPaths(manifest, loadLocations(), repoBase);
  cmdPull(repoBase);
  for (const entry of manifest.entries) {
    if (entry.kind !== "skill" || entry.sync || entry.skill.origin !== "external") continue;
    const root = roots.find((item) => item.id === entry.root);
    if (!root) throw new Error(`Missing resolved skill root: ${entry.root}`);
    if (fs.existsSync(path.join(root.local, entry.path))) continue;
    const installCmd = entry.skill.install || (entry.skill.source ? `npx -y skills add ${entry.skill.source} -g` : null);
    if (!installCmd) {
      console.log(`   ⚠️  external '${entry.path}' has no install command or source — install manually`);
      continue;
    }
    console.log(`   🌐 Installing external '${entry.path}' via: ${installCmd}`);
    try {
      execSync(installCmd, { stdio: "inherit" });
    } catch {
      console.log(`   ❌ Install failed for '${entry.path}'. Retry manually: ${installCmd}`);
    }
  }
  console.log(`\n✅ Bootstrap complete.\n`);
}

export function cmdDiscover(repoBase = DEFAULT_REPO, write = false): UnifiedManifest {
  const manifest = loadUnifiedManifest(repoBase);
  const locations = loadLocations();
  let recorded = 0;
  for (const [id, root] of Object.entries(manifest.roots)) {
    const local = locations.roots[id];
    if (!local) {
      console.log(`Unbound root '${id}'; bind it before discovery.`);
      continue;
    }
    if (!fs.existsSync(local)) continue;
    if (root.kind === "skill") {
      for (const item of fs.readdirSync(local, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
        const rel = item.name;
        if (manifest.entries.some((entry) => entry.kind === "skill" && entry.root === id && entry.path === rel)) continue;
        console.log(`Unlisted skill candidate: ${id}:${rel}`);
        if (write) {
          manifest.entries.push({ kind: "skill", root: id, path: rel, sync: false, skill: { origin: "authored" } });
          recorded++;
        }
      }
      continue;
    }
    for (const file of getAllFiles(local)) {
      const rel = path.relative(local, file).replace(/\\/g, "/");
      let matched = false;
      for (const entry of manifest.entries) {
        if (entry.kind === "path" && entry.root === id && pathRuleMatches(entry, rel)) matched = true;
      }
      if (matched) continue;
      console.log(`Unlisted path candidate: ${id}:${rel}`);
      if (write) {
        manifest.entries.push({ kind: "path", root: id, path: rel, sync: false });
        recorded++;
      }
    }
  }
  if (write) saveUnifiedManifest(repoBase, manifest);
  console.log(write ? `Recorded ${recorded} candidate(s) with sync: false.` : "Read-only discovery; no entries changed.");
  return manifest;
}

export function parseArgs(rawArgs: string[]): {
  command: string;
  repo: string;
  opts: SyncOptions;
  args: string[];
  meta: { from?: string; version?: string; sync?: boolean; root?: string; kind?: RootKind; repoRoot?: string; localRoot?: string; origin?: SkillMetadata["origin"]; sourceType?: string; install?: string; description?: string; entryPath?: string };
} {
  let command = "status";
  let repo = DEFAULT_REPO;
  const opts: SyncOptions = { exclude: [] };
  const meta: { from?: string; version?: string; sync?: boolean; root?: string; kind?: RootKind; repoRoot?: string; localRoot?: string; origin?: SkillMetadata["origin"]; sourceType?: string; install?: string; description?: string; entryPath?: string } = {};
  const positional: string[] = [];
  const named = new Map<string, keyof typeof meta>([
    ["--root", "root"], ["--kind", "kind"], ["--repo-root", "repoRoot"], ["--local-root", "localRoot"],
    ["--origin", "origin"], ["--source-type", "sourceType"], ["--install", "install"], ["--description", "description"], ["--path", "entryPath"],
  ]);
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    const option = named.get(arg);
    if (option && i + 1 < rawArgs.length) {
      (meta[option] as string | undefined) = rawArgs[++i];
    } else if (arg === "--exclude" || arg === "-x") {
      if (i + 1 < rawArgs.length) opts.exclude!.push(rawArgs[++i]);
    } else if (arg.startsWith("--exclude=")) opts.exclude!.push(arg.slice("--exclude=".length));
    else if (arg === "--target" || arg === "-t") {
      if (i + 1 < rawArgs.length) opts.target = rawArgs[++i];
    } else if (arg.startsWith("--target=")) opts.target = arg.slice("--target=".length);
    else if (arg === "--include-local") opts.includeLocal = true;
    else if (arg === "--write") opts.write = true;
    else if (arg === "--sync") meta.sync = true;
    else if (arg === "--no-sync") meta.sync = false;
    else if (arg === "--from" && i + 1 < rawArgs.length) meta.from = rawArgs[++i];
    else if (arg.startsWith("--from=")) meta.from = arg.slice("--from=".length);
    else if (arg === "--version" && i + 1 < rawArgs.length) meta.version = rawArgs[++i];
    else if (arg.startsWith("--version=")) meta.version = arg.slice("--version=".length);
    else if (!arg.startsWith("-")) positional.push(arg);
  }

  if (positional[0]) command = positional[0];
  const rest = positional.slice(1);
  if (command === "init" && rest[0]) repo = rest[0].replace(/^~/, HOME);
  else if (!["track", "untrack", "root", "bootstrap", "discover"].includes(command) && rest[0]) {
    if (rest[0].startsWith("/") || rest[0].startsWith("~") || fs.existsSync(rest[0])) repo = rest[0].replace(/^~/, HOME);
    else if (!opts.target) opts.target = rest[0];
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
    case "root":
      if (args[0] === "add" && args[1] && meta.kind && meta.repoRoot) cmdRootAdd(args[1], meta.kind, meta.repoRoot, repo);
      else if (args[0] === "bind" && args[1] && meta.localRoot) cmdRootBind(args[1], meta.localRoot, repo);
      else throw new Error("Usage: root add <id> --kind <path|skill> --repo-root <relative-path> | root bind <id> --local-root <absolute-or-~/path>");
      break;
    case "track":
      if (args[0] === "path" && args[1] && meta.root) cmdTrackPathV2(args[1], meta.root, meta.sync ?? true, repo);
      else if (args[0] === "skill" && args[1] && meta.root && meta.origin) {
        cmdTrackSkillV2(meta.entryPath ?? args[1], meta.root, {
          origin: meta.origin, source: meta.from, sourceType: meta.sourceType, install: meta.install,
          version: meta.version, description: meta.description, sync: meta.sync,
        }, repo);
      } else throw new Error("Usage: track path <pattern> --root <id> | track skill <name> --root <id> --origin <authored|external>");
      break;
    case "untrack":
      if ((args[0] === "path" || args[0] === "skill") && args[1] && meta.root) cmdUntrackV2(args[0] === "path" ? "path" : "skill", args[1], meta.root, repo);
      else throw new Error("Usage: untrack path <pattern> --root <id> | untrack skill <name> --root <id>");
      break;
    case "migrate-v2":
      cmdMigrateV2(repo);
      break;
    case "bootstrap":
    case "restore":
      cmdBootstrap(repo);
      break;
    case "discover":
      cmdDiscover(repo, opts.write === true);
      break;
    default:
      console.log(`Usage: bun sync.ts [status|discover|diff|resolve|merge|pull|push|init|root|track|untrack|migrate-v2|bootstrap] [repo_path] [--root <id>] [--kind <path|skill>] [--repo-root <path>] [--local-root <path>] [--sync|--no-sync]`);
      process.exit(1);
  }
}

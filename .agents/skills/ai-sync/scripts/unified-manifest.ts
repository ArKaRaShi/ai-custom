import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import ignore from "ignore";

export type RootKind = "path" | "skill";

export interface SyncRoot {
  kind: RootKind;
  repoRoot: string;
}

export interface SkillMetadata {
  origin: "authored" | "external";
  source?: string;
  sourceType?: string;
  version?: string;
  install?: string;
  description?: string;
}

export interface PathEntry {
  kind: "path";
  root: string;
  path: string;
  sync: boolean;
}

export interface SkillEntry {
  kind: "skill";
  root: string;
  path: string;
  sync: boolean;
  skill: SkillMetadata;
}

export type SyncEntry = PathEntry | SkillEntry;

export interface UnifiedManifest {
  version: 2;
  roots: Record<string, SyncRoot>;
  entries: SyncEntry[];
}

export interface Locations {
  version: 1;
  roots: Record<string, string>;
}

export interface ResolvedRoot {
  id: string;
  kind: RootKind;
  local: string;
  repo: string;
}

export const MANIFEST_RELATIVE = ".ai-sync/manifest.json";
export const LOCAL_LOCATIONS_FILE = path.join(os.homedir(), ".config", "ai-sync", "locations.json");

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return object(value);
}

function normalizeRelative(value: string, label: string): string {
  const normalized = value.replace(/\\/g, "/");
  if (!normalized || normalized !== normalized.trim() || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized) || /[\0\r\n]/.test(normalized) || normalized.split("/").some((part) => part === ".." || part === ".")) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return normalized.replace(/\/$/, "");
}

function within(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function nearestRealPath(value: string): string {
  let current = value;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(value);
    current = parent;
  }
  return path.resolve(fs.realpathSync(current), path.relative(current, value));
}

export function validateUnifiedManifest(value: unknown, repoBase: string): UnifiedManifest {
  if (!object(value) || value.version !== 2 || !object(value.roots) || !Array.isArray(value.entries)) {
    throw new Error("Invalid ai-sync manifest: expected version 2 with roots and entries");
  }
  const repo = path.resolve(repoBase);
  const realRepo = nearestRealPath(repo);
  const roots: Record<string, SyncRoot> = {};
  for (const [id, raw] of Object.entries(value.roots)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id) || !object(raw) || (raw.kind !== "path" && raw.kind !== "skill") || typeof raw.repoRoot !== "string") {
      throw new Error(`Invalid root: ${id}`);
    }
    const repoRoot = normalizeRelative(raw.repoRoot, `repo root for ${id}`);
    const resolvedRepo = path.resolve(repo, repoRoot);
    const realRepoRoot = nearestRealPath(resolvedRepo);
    if (!within(realRepo, realRepoRoot)) throw new Error(`Repo root escapes backup repository: ${repoRoot}`);
    roots[id] = { kind: raw.kind, repoRoot };
  }

  const entries: SyncEntry[] = [];
  const identities = new Set<string>();
  for (const raw of value.entries) {
    if (!object(raw) || (raw.kind !== "path" && raw.kind !== "skill") || typeof raw.root !== "string" || typeof raw.path !== "string" || typeof raw.sync !== "boolean") {
      throw new Error("Invalid sync entry");
    }
    const root = roots[raw.root];
    if (!root) throw new Error(`Unknown root: ${raw.root}`);
    if (root.kind !== raw.kind) throw new Error(`Root kind mismatch: ${raw.root}`);
    const entryPath = normalizeRelative(raw.path, `${raw.kind} entry path`);
    if (raw.kind === "path") {
      try { ignore().add(entryPath); } catch { throw new Error(`Invalid sync pattern: ${entryPath}`); }
      const identity = `path:${raw.root}:${entryPath}`;
      if (identities.has(identity)) throw new Error(`Duplicate sync entry: ${identity}`);
      identities.add(identity);
      entries.push({ kind: "path", root: raw.root, path: entryPath, sync: raw.sync });
      continue;
    }
    if (!object(raw.skill) || (raw.skill.origin !== "authored" && raw.skill.origin !== "external")) throw new Error(`Invalid skill metadata: ${entryPath}`);
    const metadata: SkillMetadata = { origin: raw.skill.origin };
    for (const key of ["source", "sourceType", "version", "install", "description"] as const) {
      const item = raw.skill[key];
      if (item !== undefined) {
        if (typeof item !== "string") throw new Error(`Invalid skill ${key}: ${entryPath}`);
        metadata[key] = item;
      }
    }
    const identity = `skill:${raw.root}:${entryPath}`;
    if (identities.has(identity)) throw new Error(`Duplicate sync entry: ${identity}`);
    identities.add(identity);
    entries.push({ kind: "skill", root: raw.root, path: entryPath, sync: raw.sync, skill: metadata });
  }
  return { version: 2, roots, entries };
}

export function loadUnifiedManifest(repoBase: string): UnifiedManifest {
  const file = path.join(repoBase, MANIFEST_RELATIVE);
  if (!fs.existsSync(file)) return { version: 2, roots: {}, entries: [] };
  let parsed: unknown;
  try { parsed = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { throw new Error(`Cannot read ai-sync manifest: ${file}`); }
  return validateUnifiedManifest(parsed, repoBase);
}

export function saveUnifiedManifest(repoBase: string, manifest: UnifiedManifest): void {
  const valid = validateUnifiedManifest(manifest, repoBase);
  const file = path.join(repoBase, MANIFEST_RELATIVE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(valid, null, 2)}\n`, "utf8");
  fs.renameSync(temp, file);
}

export function validateLocations(value: unknown, home = os.homedir()): Locations {
  if (!object(value) || value.version !== 1 || !object(value.roots)) throw new Error("Invalid ai-sync locations: expected version 1 with roots");
  const roots: Record<string, string> = {};
  for (const [id, raw] of Object.entries(value.roots)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id) || typeof raw !== "string" || raw.includes("$")) throw new Error(`Invalid local root binding: ${id}`);
    const expanded = raw.startsWith("~/") ? path.join(home, raw.slice(2)) : raw;
    if (!path.isAbsolute(expanded) || raw.startsWith("~") && !raw.startsWith("~/")) throw new Error(`Local root must be absolute or start with ~/: ${raw}`);
    roots[id] = path.resolve(expanded);
  }
  return { version: 1, roots };
}

export function loadLocations(file = LOCAL_LOCATIONS_FILE, home = os.homedir()): Locations {
  if (!fs.existsSync(file)) return { version: 1, roots: {} };
  let value: unknown;
  try { value = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { throw new Error(`Cannot read ai-sync locations: ${file}`); }
  return validateLocations(value, home);
}

export function saveLocations(file: string, locations: Locations): void {
  if (locations.version !== 1) throw new Error("Invalid ai-sync locations version");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(locations, null, 2)}\n`, "utf8");
  fs.renameSync(temp, file);
}

export function resolveRootPaths(manifest: UnifiedManifest, locations: Locations, repoBase: string): ResolvedRoot[] {
  const repo = path.resolve(repoBase);
  const realRepo = nearestRealPath(repo);
  const resolved: ResolvedRoot[] = [];
  for (const [id, root] of Object.entries(manifest.roots)) {
    const local = locations.roots[id];
    if (!local) throw new Error(`Missing local root binding: ${id}`);
    const repoPath = path.resolve(repo, root.repoRoot);
    if (!within(realRepo, nearestRealPath(repoPath))) throw new Error(`Repo root escapes backup repository: ${root.repoRoot}`);
    const localReal = nearestRealPath(local);
    if (resolved.some((other) => within(nearestRealPath(other.local), localReal) || within(localReal, nearestRealPath(other.local)))) {
      throw new Error(`Overlapping local root bindings: ${id}`);
    }
    resolved.push({ id, kind: root.kind, local: path.resolve(local), repo: repoPath });
  }
  return resolved;
}

export function pathRuleMatches(entry: PathEntry, relativePath: string): boolean {
  return ignore().add(entry.path).ignores(relativePath.replace(/\\/g, "/"));
}

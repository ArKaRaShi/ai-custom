import * as path from "node:path";

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
  version?: string;
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

/** Resolves a path through the deepest existing ancestor's real path (symlinks followed). */
export interface PathProbe {
  nearestRealPath(value: string): string;
}

/** True when a gitignore-style rule is syntactically valid. */
export type RuleValidator = (rule: string) => boolean;

export const MANIFEST_RELATIVE = ".ai-sync/manifest.json";

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeRelative(value: string, label: string): string {
  const normalized = value.replace(/\\/g, "/");
  if (
    !normalized ||
    normalized !== normalized.trim() ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    /[\0\r\n]/.test(normalized) ||
    normalized.split("/").some((part) => part === ".." || part === ".")
  ) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return normalized.replace(/\/$/, "");
}

/** True when `candidate` equals `root` or lies beneath it. */
export function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

export function validateUnifiedManifest(
  value: unknown,
  repoBase: string,
  probe: PathProbe,
  isValidRule: RuleValidator,
): UnifiedManifest {
  if (
    !isJsonObject(value) ||
    value.version !== 2 ||
    !isJsonObject(value.roots) ||
    !Array.isArray(value.entries)
  ) {
    throw new Error("Invalid ai-sync manifest: expected version 2 with roots and entries");
  }
  const repo = path.resolve(repoBase);
  const realRepo = probe.nearestRealPath(repo);
  const roots: Record<string, SyncRoot> = {};
  for (const [id, raw] of Object.entries(value.roots)) {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id) ||
      !isJsonObject(raw) ||
      (raw.kind !== "path" && raw.kind !== "skill") ||
      typeof raw.repoRoot !== "string"
    ) {
      throw new Error(`Invalid root: ${id}`);
    }
    const repoRoot = normalizeRelative(raw.repoRoot, `repo root for ${id}`);
    const resolvedRepo = path.resolve(repo, repoRoot);
    const realRepoRoot = probe.nearestRealPath(resolvedRepo);
    if (!isWithin(realRepo, realRepoRoot)) {
      throw new Error(`Repo root escapes backup repository: ${repoRoot}`);
    }
    roots[id] = { kind: raw.kind, repoRoot };
  }

  const entries: SyncEntry[] = [];
  const identities = new Set<string>();
  for (const raw of value.entries) {
    if (
      !isJsonObject(raw) ||
      (raw.kind !== "path" && raw.kind !== "skill") ||
      typeof raw.root !== "string" ||
      typeof raw.path !== "string" ||
      typeof raw.sync !== "boolean"
    ) {
      throw new Error("Invalid sync entry");
    }
    const root = roots[raw.root];
    if (!root) throw new Error(`Unknown root: ${raw.root}`);
    if (root.kind !== raw.kind) throw new Error(`Root kind mismatch: ${raw.root}`);
    const entryPath = normalizeRelative(raw.path, `${raw.kind} entry path`);
    if (raw.kind === "path") {
      if (!isValidRule(entryPath)) throw new Error(`Invalid sync pattern: ${entryPath}`);
      const identity = `path:${raw.root}:${entryPath}`;
      if (identities.has(identity)) throw new Error(`Duplicate sync entry: ${identity}`);
      identities.add(identity);
      if (raw.version !== undefined && typeof raw.version !== "string") {
        throw new Error(`Invalid version label: ${entryPath}`);
      }
      entries.push({
        kind: "path",
        root: raw.root,
        path: entryPath,
        sync: raw.sync,
        ...(raw.version !== undefined ? { version: raw.version } : {}),
      });
      continue;
    }
    if (
      !isJsonObject(raw.skill) ||
      (raw.skill.origin !== "authored" && raw.skill.origin !== "external")
    ) {
      throw new Error(`Invalid skill metadata: ${entryPath}`);
    }
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
    entries.push({
      kind: "skill",
      root: raw.root,
      path: entryPath,
      sync: raw.sync,
      skill: metadata,
    });
  }
  return { version: 2, roots, entries };
}

export function validateLocations(value: unknown, home: string): Locations {
  if (!isJsonObject(value) || value.version !== 1 || !isJsonObject(value.roots)) {
    throw new Error("Invalid ai-sync locations: expected version 1 with roots");
  }
  const roots: Record<string, string> = {};
  for (const [id, raw] of Object.entries(value.roots)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id) || typeof raw !== "string" || raw.includes("$")) {
      throw new Error(`Invalid local root binding: ${id}`);
    }
    const expanded = raw.startsWith("~/") ? path.join(home, raw.slice(2)) : raw;
    if (!path.isAbsolute(expanded) || (raw.startsWith("~") && !raw.startsWith("~/"))) {
      throw new Error(`Local root must be absolute or start with ~/: ${raw}`);
    }
    roots[id] = path.resolve(expanded);
  }
  return { version: 1, roots };
}

export function resolveRootPaths(
  manifest: UnifiedManifest,
  locations: Locations,
  repoBase: string,
  probe: PathProbe,
): ResolvedRoot[] {
  const repo = path.resolve(repoBase);
  const realRepo = probe.nearestRealPath(repo);
  const resolved: ResolvedRoot[] = [];
  for (const [id, root] of Object.entries(manifest.roots)) {
    const local = locations.roots[id];
    if (!local) throw new Error(`Missing local root binding: ${id}`);
    const repoPath = path.resolve(repo, root.repoRoot);
    if (!isWithin(realRepo, probe.nearestRealPath(repoPath))) {
      throw new Error(`Repo root escapes backup repository: ${root.repoRoot}`);
    }
    const localReal = probe.nearestRealPath(local);
    if (
      resolved.some(
        (other) =>
          isWithin(probe.nearestRealPath(other.local), localReal) ||
          isWithin(localReal, probe.nearestRealPath(other.local)),
      )
    ) {
      throw new Error(`Overlapping local root bindings: ${id}`);
    }
    resolved.push({ id, kind: root.kind, local: path.resolve(local), repo: repoPath });
  }
  return resolved;
}

/**
 * The part of the shared manifest that decides what transfers or is removed. Version labels
 * describe a release and never policy or content, so they are left out: editing one cannot make a
 * saved plan stale or be mistaken for drift.
 */
export function syncPolicyOf(manifest: UnifiedManifest): UnifiedManifest {
  return {
    version: manifest.version,
    roots: manifest.roots,
    entries: manifest.entries.map((entry): SyncEntry => {
      if (entry.kind === "path") {
        const { version: _label, ...rest } = entry;
        return rest;
      }
      const { version: _label, ...skill } = entry.skill;
      return { ...entry, skill };
    }),
  };
}

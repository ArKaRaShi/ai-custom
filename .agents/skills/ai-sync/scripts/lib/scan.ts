import {
  type PathEntry,
  type ResolvedRoot,
  type SyncEntry,
  syncPolicyOf,
  type UnifiedManifest,
} from "@/scripts/lib/manifest";
import { hashCanonical, resolvedPathId, SyncError } from "@/scripts/lib/plan";
import { normalizeTarget, type TargetTest } from "@/scripts/lib/targets";

export interface ResolvedSyncTarget {
  local: string;
  repo: string;
  name: string;
  category: string;
  rootId: string;
  entries: SyncEntry[];
}

export interface LoadedRoots {
  manifest: UnifiedManifest;
  roots: ResolvedRoot[];
}

export interface DiffReport {
  missingInRepo: string[];
  missingInLocal: string[];
  modified: string[];
  inSync: number;
}

export type EntryState = "in_sync" | "modified" | "new_local" | "new_repo";

/** One managed file on either side. `path` is root-relative with `/` separators. */
export interface ScanEntry {
  root: string;
  /** skill name for skill roots */
  item?: string;
  path: string;
  local: string;
  repo: string;
  state: EntryState;
}

export interface ScanResult extends LoadedRoots {
  entries: ScanEntry[];
  itemNames: string[];
}

/** A backup working-tree file whose item the shared policy excludes from transfers. */
export interface ExcludedCopy {
  root: string;
  /** skill name for skill roots */
  item?: string;
  path: string;
  /** the machine-local counterpart; prune never reads or changes it */
  local: string;
  repo: string;
}

export interface PruneScan extends LoadedRoots {
  copies: ExcludedCopy[];
}

/** Tests a path-entry rule (gitignore-style) against a root-relative path. */
export type PathRuleTest = (entry: PathEntry, relativePath: string) => boolean;

export function entryIdentity(entry: ScanEntry): string {
  return resolvedPathId(entry.root, entry.path);
}

export function unknownTargetError(unknown: string[]): SyncError {
  return new SyncError(
    unknown.map((target) => ({
      code: "UNKNOWN_TARGET" as const,
      item: target,
      message: `Target '${target}' matches no managed root, item, or path.`,
    })),
    "Use a root id, skill name, root-relative path, <root>:<path>, or a glob. Targets match exactly, never by substring.",
  );
}

/** Apply explicit targets. No targets selects everything. Unknown targets are returned, not dropped. */
export function selectEntries(
  scanned: ScanResult,
  targets: string[],
  matchesTarget: TargetTest,
): { selected: ScanEntry[]; unknown: string[] } {
  if (targets.length === 0) return { selected: scanned.entries, unknown: [] };
  const picked = new Set<ScanEntry>();
  const unknown: string[] = [];
  const rootIds = scanned.roots.map((root) => root.id);
  for (const raw of targets) {
    const name = normalizeTarget(raw);
    const matched = scanned.entries.filter((entry) =>
      matchesTarget(raw, { root: entry.root, path: entry.path, item: entry.item }),
    );
    for (const entry of matched) picked.add(entry);
    const namesManagedItem =
      rootIds.includes(name) ||
      scanned.itemNames.includes(name) ||
      rootIds.some((id) => name === `${id}:`);
    if (matched.length === 0 && !namesManagedItem) unknown.push(raw);
  }
  return { selected: scanned.entries.filter((entry) => picked.has(entry)), unknown };
}

/** Apply explicit targets to excluded copies. No targets selects all. Unknown targets are returned, not dropped. */
export function selectCopies(
  scanned: PruneScan,
  targets: string[],
  matchesTarget: TargetTest,
): { selected: ExcludedCopy[]; unknown: string[] } {
  if (targets.length === 0) return { selected: scanned.copies, unknown: [] };
  const picked = new Set<ExcludedCopy>();
  const unknown: string[] = [];
  const skillNames = scanned.manifest.entries
    .filter((entry) => entry.kind === "skill")
    .map((entry) => entry.path);
  for (const raw of targets) {
    const name = normalizeTarget(raw);
    const matched = scanned.copies.filter((copy) =>
      matchesTarget(raw, { root: copy.root, path: copy.path, item: copy.item }),
    );
    for (const copy of matched) picked.add(copy);
    const namesManagedItem =
      Object.keys(scanned.manifest.roots).some((id) => name === id || name === `${id}:`) ||
      skillNames.includes(name);
    if (matched.length === 0 && !namesManagedItem) unknown.push(raw);
  }
  return { selected: scanned.copies.filter((copy) => picked.has(copy)), unknown };
}

/**
 * True when the policy names this file's item and says it does not sync. Path rules follow the
 * transfer scan: the last matching rule decides, and a file no rule mentions is not excluded.
 * A skill file is excluded only when every skill entry covering it is sync-off.
 */
export function isExcludedByPolicy(
  manifest: UnifiedManifest,
  rootId: string,
  relPath: string,
  ruleMatches: PathRuleTest,
): boolean {
  const root = manifest.roots[rootId];
  if (!root) return false;
  const entries = manifest.entries.filter((entry) => entry.root === rootId);
  if (root.kind === "path") {
    let verdict: boolean | undefined;
    for (const entry of entries) {
      if (entry.kind === "path" && ruleMatches(entry, relPath)) verdict = entry.sync;
    }
    return verdict === false;
  }
  const covering = entries.filter(
    (entry) =>
      entry.kind === "skill" && (relPath === entry.path || relPath.startsWith(`${entry.path}/`)),
  );
  return covering.length > 0 && covering.every((entry) => !entry.sync);
}

export function bindingsHashOf(roots: ResolvedRoot[]): string {
  return hashCanonical(Object.fromEntries(roots.map((root) => [root.id, root.local])));
}

/** Version labels describe a release, not policy, so editing one never changes what a plan binds to. */
export function policyHashOf(manifest: UnifiedManifest): string {
  return hashCanonical(syncPolicyOf(manifest));
}

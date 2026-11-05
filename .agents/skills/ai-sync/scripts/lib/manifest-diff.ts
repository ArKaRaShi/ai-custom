import type { Io } from "@/scripts/io/io";
import { type GitPushScope, isInside } from "@/scripts/lib/git";
import { MANIFEST_RELATIVE, type SyncEntry, type UnifiedManifest } from "@/scripts/lib/manifest";
import { loadUnifiedManifest, validateManifest } from "@/scripts/lib/manifest-repository";
import type { ManifestChange, ManifestDiff } from "@/scripts/lib/plan";

// Read-only summary of how the manifest a Git step exports differs from Git HEAD.

interface KeyedItem {
  change: ManifestChange;
  /** Comparable fields, rendered as text. */
  fields: Record<string, string>;
}

function fieldsOf(entry: SyncEntry): Record<string, string> {
  const fields: Record<string, string> = { sync: String(entry.sync) };
  if (entry.kind === "path") {
    if (entry.version !== undefined) fields.version = entry.version;
  } else {
    for (const [name, value] of Object.entries(entry.skill)) fields[name] = String(value);
  }
  return fields;
}

/** Every root and entry by identity (`kind|root|path`), in manifest order. */
function itemsOf(manifest: UnifiedManifest): Map<string, KeyedItem> {
  const items = new Map<string, KeyedItem>();
  for (const [id, root] of Object.entries(manifest.roots)) {
    items.set(`root|${id}`, {
      change: { kind: "root", root: id, path: root.repoRoot },
      fields: { kind: root.kind, repoRoot: root.repoRoot },
    });
  }
  for (const entry of manifest.entries) {
    items.set(`${entry.kind}|${entry.root}|${entry.path}`, {
      change: { kind: entry.kind, root: entry.root, path: entry.path },
      fields: fieldsOf(entry),
    });
  }
  return items;
}

/** `field: before → after` for each field that differs between two comparable field sets. */
function fieldChanges(before: Record<string, string>, after: Record<string, string>): string[] {
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return names
    .filter((name) => before[name] !== after[name])
    .map((name) => `${name}: ${before[name] ?? "(unset)"} → ${after[name] ?? "(unset)"}`);
}

/** Lines added and removed between two line lists: the lines outside their longest common subsequence. */
function lineChanges(before: string[], after: string[]): { added: number; removed: number } {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd--;
    afterEnd--;
  }
  const left = before.slice(start, beforeEnd);
  const right = after.slice(start, afterEnd);
  let previous = new Array<number>(right.length + 1).fill(0);
  for (const leftLine of left) {
    const current = new Array<number>(right.length + 1).fill(0);
    right.forEach((rightLine, column) => {
      current[column + 1] =
        leftLine === rightLine
          ? (previous[column] ?? 0) + 1
          : Math.max(previous[column + 1] ?? 0, current[column] ?? 0);
    });
    previous = current;
  }
  const common = previous[right.length] ?? 0;
  return { added: right.length - common, removed: left.length - common };
}

const textLines = (manifest: UnifiedManifest | null): string[] =>
  manifest ? JSON.stringify(manifest, null, 2).split("\n") : [];

/** How `after` differs from `before`; a null `before` counts every entry as added. */
export function diffManifests(
  before: UnifiedManifest | null,
  after: UnifiedManifest,
): ManifestDiff {
  const beforeItems = before ? itemsOf(before) : new Map<string, KeyedItem>();
  const afterItems = itemsOf(after);
  const diff: ManifestDiff = {
    base: before ? "head" : "none",
    added: [],
    removed: [],
    changed: [],
    lines: lineChanges(textLines(before), textLines(after)),
  };
  for (const [key, item] of afterItems) {
    const old = beforeItems.get(key);
    if (!old) {
      diff.added.push(item.change);
      continue;
    }
    const changes = fieldChanges(old.fields, item.fields);
    if (changes.length > 0) diff.changed.push({ ...item.change, changes });
  }
  for (const [key, item] of beforeItems) {
    if (!afterItems.has(key)) diff.removed.push(item.change);
  }
  return diff;
}

/** The manifest at Git HEAD, or null when HEAD holds no valid ai-sync v2 manifest. */
function headManifest(io: Io, repoBase: string): UnifiedManifest | null {
  const text = io.git.readHeadFile(repoBase, MANIFEST_RELATIVE);
  if (text === null) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return validateManifest(io, parsed, repoBase);
  } catch {
    return null;
  }
}

/**
 * Git HEAD against the working-tree manifest, or against `after` when the operation will leave a
 * different manifest than the one on disk (a preview of an edit not yet made). Read-only.
 */
export function manifestDiffOf(io: Io, repoBase: string, after?: UnifiedManifest): ManifestDiff {
  const working = after ?? loadUnifiedManifest(io, repoBase);
  return diffManifests(headManifest(io, repoBase), working);
}

/** The manifest's part in a push: its diff, its path in the Git working tree, and whether its pending changes block the push. */
export interface PushManifest {
  diff: ManifestDiff;
  gitPath: string;
  /** True when the manifest has pending changes outside the push's export set. */
  blocking: boolean;
}

/**
 * The manifest's part in a push whose Git scope exports it or leaves it pending outside the export
 * set; undefined when the manifest plays no part in the push.
 */
export function pushManifestOf(
  io: Io,
  repoBase: string,
  scope: GitPushScope,
): PushManifest | undefined {
  const prefix = io.git.repoPrefix(repoBase);
  if (prefix === null) return undefined;
  const gitPath = `${prefix}${MANIFEST_RELATIVE}`;
  const blocking = scope.unrelatedChanges.includes(gitPath);
  const exported = scope.exportedPaths.some((path) => isInside(gitPath, path));
  if (!blocking && !exported) return undefined;
  return { diff: manifestDiffOf(io, repoBase), gitPath, blocking };
}

const identity = (change: ManifestChange): string =>
  change.kind === "root"
    ? `root ${change.root} (${change.path})`
    : `${change.kind} ${change.root}:${change.path}`;

/** Tree lines for a manifest diff: a summary, then one line per added, removed, or changed entry. */
export function manifestDiffNotes(diff: ManifestDiff | undefined): string[] {
  if (!diff) return [];
  const { added, removed, changed, lines } = diff;
  const base = diff.base === "none" ? "; HEAD has no valid manifest" : "";
  const summary =
    added.length + removed.length + changed.length === 0
      ? "no entry changes"
      : `${added.length} added, ${removed.length} removed, ${changed.length} changed`;
  const notes = [`manifest diff: ${summary} (+${lines.added} -${lines.removed} lines${base})`];
  for (const change of added) notes.push(`manifest + ${identity(change)}`);
  for (const change of removed) notes.push(`manifest - ${identity(change)}`);
  for (const change of changed) {
    notes.push(`manifest ~ ${identity(change)}  ${(change.changes ?? []).join("; ")}`);
  }
  return notes;
}

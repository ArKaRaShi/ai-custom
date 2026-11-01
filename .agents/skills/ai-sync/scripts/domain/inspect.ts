import * as path from "node:path";
import type { Locations, SyncEntry, UnifiedManifest } from "@/scripts/domain/manifest";
import { type InspectItem, type Result, resolvedPathId } from "@/scripts/domain/plan";
import { normalizeTarget, type TargetTest } from "@/scripts/domain/targets";

/** A registered entry as seen by this machine: its policy, recorded labels, and bound local path. */
export function inspectItem(entry: SyncEntry, locations: Locations): InspectItem {
  const bound = locations.roots[entry.root];
  const common = {
    root: entry.root,
    path: entry.path,
    policy: entry.sync ? ("shared" as const) : ("local-only" as const),
    local: bound === undefined ? null : path.join(bound, ...entry.path.split("/")),
  };
  if (entry.kind === "path") return { kind: "path", ...common, version: entry.version ?? null };
  return {
    kind: "skill",
    ...common,
    version: entry.skill.version ?? null,
    origin: entry.skill.origin,
    source: entry.skill.source ?? null,
    install: entry.skill.install ?? null,
  };
}

/**
 * Registered items, in manifest order, selected by exact or glob targets over the root id, skill
 * name, or `<root>:<entry>`. No targets selects every item. Targets matching nothing are returned.
 */
export function inspectItems(
  manifest: UnifiedManifest,
  locations: Locations,
  targets: string[],
  matchesTarget: TargetTest,
): { items: InspectItem[]; unknown: string[] } {
  const picked = new Set<SyncEntry>();
  const unknown: string[] = [];
  for (const raw of targets) {
    const matched = manifest.entries.filter((entry) =>
      matchesTarget(raw, {
        root: entry.root,
        path: entry.path,
        item: entry.kind === "skill" ? entry.path : undefined,
      }),
    );
    for (const entry of matched) picked.add(entry);
    const name = normalizeTarget(raw);
    const namesRoot = Object.keys(manifest.roots).some((id) => name === id || name === `${id}:`);
    if (matched.length === 0 && !namesRoot) unknown.push(raw);
  }
  const selected =
    targets.length === 0 ? manifest.entries : manifest.entries.filter((entry) => picked.has(entry));
  return { items: selected.map((entry) => inspectItem(entry, locations)), unknown };
}

/** The `inspect` envelope over the selected items. */
export function inspectResultOf(items: InspectItem[]): Result {
  return {
    operation: "inspect",
    scope: {
      roots: [...new Set(items.map((item) => item.root))].sort(),
      resolvedPaths: items.map((item) => resolvedPathId(item.root, item.path)),
    },
    actions: [],
    outcome: "success",
    errors: [],
    recovery: null,
    items,
  };
}

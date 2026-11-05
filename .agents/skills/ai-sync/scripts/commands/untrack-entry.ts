import { type TrackPathOutput, trackPath } from "@/scripts/commands/track-path";
import { type TrackSkillOutput, trackSkill } from "@/scripts/commands/track-skill";
import type { Io } from "@/scripts/io/io";
import type { RootKind } from "@/scripts/lib/manifest";
import { loadUnifiedManifest, saveUnifiedManifest } from "@/scripts/lib/manifest-repository";

export interface UntrackEntryInput {
  kind: RootKind;
  name: string;
  rootId: string;
  repoBase: string;
  /** Skills only: keep the entry with sync off so `prune` can remove its backup copy. */
  prune?: boolean;
}

export type UntrackEntryOutput =
  /** A path rule is excluded rather than removed, exactly as `track --no-sync` would. */
  | { kind: "path"; track: TrackPathOutput }
  | { kind: "skill"; entryPath: string; rootId: string }
  /** A skill kept as an exclusion so its backup copy becomes prunable. */
  | { kind: "skill-excluded"; track: TrackSkillOutput };

export function untrackEntry(io: Io, input: UntrackEntryInput): UntrackEntryOutput {
  const { kind, name, rootId, repoBase, prune } = input;
  const manifest = loadUnifiedManifest(io, repoBase);
  if (manifest.roots[rootId]?.kind !== kind) {
    throw new Error(`Unknown or wrong-kind root: ${rootId}`);
  }
  const entryPath = kind === "path" ? name.replace(/\/$/, "") : name;
  if (kind === "path") {
    const track = trackPath(io, { pattern: entryPath, rootId, sync: false, repoBase });
    return { kind: "path", track };
  }
  if (prune) {
    const track = trackSkill(io, {
      name: entryPath,
      rootId,
      metadata: { sync: false },
      repoBase,
    });
    return { kind: "skill-excluded", track };
  }
  manifest.entries = manifest.entries.filter(
    (entry) => !(entry.kind === "skill" && entry.root === rootId && entry.path === entryPath),
  );
  saveUnifiedManifest(io, repoBase, manifest);
  return { kind: "skill", entryPath, rootId };
}

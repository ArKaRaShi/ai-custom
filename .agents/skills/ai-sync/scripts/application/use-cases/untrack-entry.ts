import type { ManifestRepository } from "@/scripts/application/services/manifest-repository";
import type { RootKind } from "@/scripts/domain/manifest";
import type { TrackPath, TrackPathOutput } from "./track-path";

export interface UntrackEntryDeps {
  manifestRepository: ManifestRepository;
  trackPath: TrackPath;
}

export interface UntrackEntryInput {
  kind: RootKind;
  name: string;
  rootId: string;
  repoBase: string;
}

export type UntrackEntryOutput =
  /** A path rule is excluded rather than removed, exactly as `track --no-sync` would. */
  { kind: "path"; track: TrackPathOutput } | { kind: "skill"; entryPath: string; rootId: string };

export class UntrackEntry {
  constructor(private readonly deps: UntrackEntryDeps) {}

  execute(input: UntrackEntryInput): UntrackEntryOutput {
    const { manifestRepository, trackPath } = this.deps;
    const { kind, name, rootId, repoBase } = input;
    const manifest = manifestRepository.loadUnifiedManifest(repoBase);
    if (manifest.roots[rootId]?.kind !== kind) {
      throw new Error(`Unknown or wrong-kind root: ${rootId}`);
    }
    const entryPath = kind === "path" ? name.replace(/\/$/, "") : name;
    if (kind === "path") {
      const track = trackPath.execute({ pattern: entryPath, rootId, sync: false, repoBase });
      return { kind: "path", track };
    }
    manifest.entries = manifest.entries.filter(
      (entry) => !(entry.kind === "skill" && entry.root === rootId && entry.path === entryPath),
    );
    manifestRepository.saveUnifiedManifest(repoBase, manifest);
    return { kind: "skill", entryPath, rootId };
  }
}

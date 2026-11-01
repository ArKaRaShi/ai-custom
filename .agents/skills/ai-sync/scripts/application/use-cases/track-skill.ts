import * as path from "node:path";
import type { FileSystem } from "@/scripts/application/interfaces/file-system";
import type { ManifestRepository } from "@/scripts/application/services/manifest-repository";
import type { SkillMetadata, SyncEntry } from "@/scripts/domain/manifest";

export interface UnifiedTrackMetadata {
  sync?: boolean;
  origin?: "authored" | "external";
  source?: string;
  sourceType?: string;
  version?: string;
  install?: string;
  description?: string;
}

export interface TrackSkillDeps {
  manifestRepository: ManifestRepository;
  fileSystem: FileSystem;
}

export interface TrackSkillInput {
  name: string;
  rootId: string;
  metadata: UnifiedTrackMetadata;
  repoBase: string;
}

export interface TrackSkillOutput {
  name: string;
  rootId: string;
  sync: boolean;
  /** Backup copy (relative to the repository) that stays after sync was switched off. */
  retainedBackup?: string;
}

export class TrackSkill {
  constructor(private readonly deps: TrackSkillDeps) {}

  execute(input: TrackSkillInput): TrackSkillOutput {
    const { manifestRepository, fileSystem } = this.deps;
    const { name, rootId, metadata, repoBase } = input;
    const manifest = manifestRepository.loadUnifiedManifest(repoBase);
    const root = manifest.roots[rootId];
    if (root?.kind !== "skill") throw new Error(`Unknown or non-skill root: ${rootId}`);
    const origin = metadata.origin;
    if (origin !== "authored" && origin !== "external") {
      throw new Error("Skill origin must be authored or external");
    }
    const sync = metadata.sync ?? origin === "authored";
    const existing = manifest.entries.find(
      (entry) => entry.kind === "skill" && entry.root === rootId && entry.path === name,
    );
    const recorded = existing?.kind === "skill" ? existing.skill : undefined;
    const skill: SkillMetadata = { origin };
    for (const field of ["source", "sourceType", "version", "install", "description"] as const) {
      const value = metadata[field] ?? recorded?.[field];
      if (value !== undefined) skill[field] = value;
    }
    const target = path.join(repoBase, root.repoRoot, name);
    const wasSynced = manifest.entries.some(
      (entry) =>
        entry.kind === "skill" && entry.root === rootId && entry.path === name && entry.sync,
    );
    const index = manifest.entries.findIndex(
      (entry) => entry.kind === "skill" && entry.root === rootId && entry.path === name,
    );
    const registered: SyncEntry = { kind: "skill", root: rootId, path: name, sync, skill };
    if (index >= 0) manifest.entries[index] = registered;
    else manifest.entries.push(registered);
    manifestRepository.saveUnifiedManifest(repoBase, manifest);
    const output: TrackSkillOutput = { name, rootId, sync };
    if (wasSynced && !sync && fileSystem.exists(target)) {
      output.retainedBackup = path.relative(repoBase, target);
    }
    return output;
  }
}

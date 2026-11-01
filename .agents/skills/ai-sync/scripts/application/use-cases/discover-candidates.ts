import * as path from "node:path";
import type { FileSystem } from "@/scripts/application/interfaces/file-system";
import type { Reporter } from "@/scripts/application/interfaces/reporter";
import type { ManifestRepository } from "@/scripts/application/services/manifest-repository";
import type { TargetMatcher } from "@/scripts/application/services/target-matcher";
import type { UnifiedManifest } from "@/scripts/domain/manifest";

export interface DiscoverCandidatesDeps {
  manifestRepository: ManifestRepository;
  fileSystem: FileSystem;
  targetMatcher: TargetMatcher;
  /** Receives one line per unbound root or unlisted candidate as discovery walks the roots. */
  reporter: Reporter;
}

export interface DiscoverCandidatesInput {
  repoBase: string;
  /** Record candidates in the manifest with `sync: false`. */
  write: boolean;
}

export interface DiscoverCandidatesOutput {
  manifest: UnifiedManifest;
  write: boolean;
  /** Candidates recorded in the manifest; always 0 for a read-only run. */
  recorded: number;
}

export class DiscoverCandidates {
  constructor(private readonly deps: DiscoverCandidatesDeps) {}

  execute(input: DiscoverCandidatesInput): DiscoverCandidatesOutput {
    const { manifestRepository, fileSystem, targetMatcher, reporter } = this.deps;
    const { repoBase, write } = input;
    const manifest = manifestRepository.loadUnifiedManifest(repoBase);
    const locations = manifestRepository.loadLocations();
    let recorded = 0;
    for (const [id, root] of Object.entries(manifest.roots)) {
      const local = locations.roots[id];
      if (!local) {
        reporter.info(`Unbound root '${id}'; bind it before discovery.`);
        continue;
      }
      if (!fileSystem.exists(local)) continue;
      if (root.kind === "skill") {
        for (const item of fileSystem.listDir(local).filter((entry) => entry.isDirectory)) {
          const rel = item.name;
          if (
            manifest.entries.some(
              (entry) => entry.kind === "skill" && entry.root === id && entry.path === rel,
            )
          ) {
            continue;
          }
          reporter.info(`Unlisted skill candidate: ${id}:${rel}`);
          if (write) {
            manifest.entries.push({
              kind: "skill",
              root: id,
              path: rel,
              sync: false,
              skill: { origin: "authored" },
            });
            recorded++;
          }
        }
        continue;
      }
      for (const file of fileSystem.getAllFiles(local)) {
        const rel = path.relative(local, file).replace(/\\/g, "/");
        let matched = false;
        for (const entry of manifest.entries) {
          if (
            entry.kind === "path" &&
            entry.root === id &&
            targetMatcher.pathRuleMatches(entry, rel)
          ) {
            matched = true;
          }
        }
        if (matched) continue;
        reporter.info(`Unlisted path candidate: ${id}:${rel}`);
        if (write) {
          manifest.entries.push({ kind: "path", root: id, path: rel, sync: false });
          recorded++;
        }
      }
    }
    if (write) manifestRepository.saveUnifiedManifest(repoBase, manifest);
    return { manifest, write, recorded };
  }
}

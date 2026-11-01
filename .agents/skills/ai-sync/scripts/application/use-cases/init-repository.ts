import * as path from "node:path";
import type { FileSystem } from "@/scripts/application/interfaces/file-system";
import type { ManifestRepository } from "@/scripts/application/services/manifest-repository";

export interface InitRepositoryDeps {
  manifestRepository: ManifestRepository;
  fileSystem: FileSystem;
}

export interface InitRepositoryInput {
  repoBase: string;
}

export interface InitRepositoryOutput {
  /** False when a manifest already existed and nothing was written. */
  created: boolean;
  /** Roots in the existing manifest; meaningful when `created` is false. */
  rootCount: number;
  manifestFile: string;
}

export class InitRepository {
  constructor(private readonly deps: InitRepositoryDeps) {}

  execute(input: InitRepositoryInput): InitRepositoryOutput {
    const { manifestRepository, fileSystem } = this.deps;
    const { repoBase } = input;
    const manifest = manifestRepository.loadUnifiedManifest(repoBase);
    const manifestFile = path.join(repoBase, ".ai-sync", "manifest.json");
    if (fileSystem.exists(manifestFile)) {
      return { created: false, rootCount: Object.keys(manifest.roots).length, manifestFile };
    }
    manifestRepository.saveUnifiedManifest(repoBase, { version: 2, roots: {}, entries: [] });
    return { created: true, rootCount: 0, manifestFile };
  }
}

import type { ManifestRepository } from "@/scripts/application/services/manifest-repository";
import type { RootKind } from "@/scripts/domain/manifest";

export interface AddRootDeps {
  manifestRepository: ManifestRepository;
}

export interface AddRootInput {
  id: string;
  kind: RootKind;
  repoRoot: string;
  repoBase: string;
}

export interface AddRootOutput {
  id: string;
  kind: RootKind;
  repoRoot: string;
}

export class AddRoot {
  constructor(private readonly deps: AddRootDeps) {}

  execute(input: AddRootInput): AddRootOutput {
    const { manifestRepository } = this.deps;
    const { id, kind, repoRoot, repoBase } = input;
    const manifest = manifestRepository.loadUnifiedManifest(repoBase);
    manifest.roots[id] = { kind, repoRoot };
    manifestRepository.saveUnifiedManifest(repoBase, manifest);
    return { id, kind, repoRoot };
  }
}

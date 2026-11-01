import type { Environment } from "@/scripts/application/interfaces/environment";
import type { ManifestRepository } from "@/scripts/application/services/manifest-repository";

export interface BindRootDeps {
  manifestRepository: ManifestRepository;
  environment: Environment;
}

export interface BindRootInput {
  id: string;
  localRoot: string;
  repoBase: string;
}

export interface BindRootOutput {
  id: string;
  /** The validated local path, with `~/` expanded. */
  local: string;
}

export class BindRoot {
  constructor(private readonly deps: BindRootDeps) {}

  execute(input: BindRootInput): BindRootOutput {
    const { manifestRepository, environment } = this.deps;
    const { id, localRoot, repoBase } = input;
    const manifest = manifestRepository.loadUnifiedManifest(repoBase);
    if (!manifest.roots[id]) throw new Error(`Unknown root: ${id}`);
    const locations = manifestRepository.loadLocations();
    const next = { version: 1 as const, roots: { ...locations.roots, [id]: localRoot } };
    const validated = manifestRepository.validateLocations(next);
    manifestRepository.saveLocations(environment.locationsFile, validated);
    return { id, local: String(validated.roots[id]) };
  }
}

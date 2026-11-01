import * as path from "node:path";
import type { Environment } from "@/scripts/application/interfaces/environment";
import type { FileSystem } from "@/scripts/application/interfaces/file-system";
import type { GlobMatcher } from "@/scripts/application/interfaces/glob-matcher";
import {
  type Locations,
  MANIFEST_RELATIVE,
  type ResolvedRoot,
  resolveRootPaths,
  type UnifiedManifest,
  validateLocations,
  validateUnifiedManifest,
} from "@/scripts/domain/manifest";

export interface ManifestRepositoryDeps {
  fileSystem: FileSystem;
  environment: Environment;
  globMatcher: GlobMatcher;
}

/** Loads, validates, and saves the shared manifest and this machine's root bindings. */
export class ManifestRepository {
  constructor(private readonly deps: ManifestRepositoryDeps) {}

  /** Validates untrusted manifest data against the backup repository. */
  validateManifest(value: unknown, repoBase: string): UnifiedManifest {
    const { fileSystem, globMatcher } = this.deps;
    return validateUnifiedManifest(value, repoBase, fileSystem, (rule) =>
      globMatcher.isValidRule(rule),
    );
  }

  /** Validates untrusted locations data, expanding `~/` against the environment home. */
  validateLocations(value: unknown): Locations {
    return validateLocations(value, this.deps.environment.home);
  }

  /** Resolves each manifest root to its local and backup paths. */
  resolveRoots(manifest: UnifiedManifest, locations: Locations, repoBase: string): ResolvedRoot[] {
    return resolveRootPaths(manifest, locations, repoBase, this.deps.fileSystem);
  }

  /** The manifest in `repoBase`, or an empty one when none exists. */
  loadUnifiedManifest(repoBase: string): UnifiedManifest {
    const { fileSystem } = this.deps;
    const file = path.join(repoBase, MANIFEST_RELATIVE);
    if (!fileSystem.exists(file)) return { version: 2, roots: {}, entries: [] };
    let parsed: unknown;
    try {
      parsed = JSON.parse(fileSystem.readText(file));
    } catch {
      throw new Error(`Cannot read ai-sync manifest: ${file}`);
    }
    return this.validateManifest(parsed, repoBase);
  }

  /** Validates, then atomically writes the manifest into `repoBase`. */
  saveUnifiedManifest(repoBase: string, manifest: UnifiedManifest): void {
    const valid = this.validateManifest(manifest, repoBase);
    const file = path.join(repoBase, MANIFEST_RELATIVE);
    this.deps.fileSystem.writeTextAtomic(file, `${JSON.stringify(valid, null, 2)}\n`);
  }

  /** Local root bindings from `file` (default: the environment's locations file), or none. */
  loadLocations(file: string = this.deps.environment.locationsFile): Locations {
    const { fileSystem } = this.deps;
    if (!fileSystem.exists(file)) return { version: 1, roots: {} };
    let value: unknown;
    try {
      value = JSON.parse(fileSystem.readText(file));
    } catch {
      throw new Error(`Cannot read ai-sync locations: ${file}`);
    }
    return this.validateLocations(value);
  }

  /** Atomically writes local root bindings to `file`. */
  saveLocations(file: string, locations: Locations): void {
    if (locations.version !== 1) throw new Error("Invalid ai-sync locations version");
    this.deps.fileSystem.writeTextAtomic(file, `${JSON.stringify(locations, null, 2)}\n`);
  }
}

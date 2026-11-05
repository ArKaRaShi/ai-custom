import * as path from "node:path";
import type { Io } from "@/scripts/io/io";
import {
  type Locations,
  MANIFEST_RELATIVE,
  type ResolvedRoot,
  resolveRootPaths,
  type UnifiedManifest,
  validateLocations as validateLocationsData,
  validateUnifiedManifest,
} from "@/scripts/lib/manifest";

/** Validates untrusted manifest data against the backup repository. */
export function validateManifest(io: Io, value: unknown, repoBase: string): UnifiedManifest {
  const { fileSystem, globMatcher } = io;
  return validateUnifiedManifest(value, repoBase, fileSystem, (rule) =>
    globMatcher.isValidRule(rule),
  );
}

/** Validates untrusted locations data, expanding `~/` against the environment home. */
export function validateLocations(io: Io, value: unknown): Locations {
  return validateLocationsData(value, io.environment.home);
}

/** Resolves each manifest root to its local and backup paths. */
export function resolveRoots(
  io: Io,
  manifest: UnifiedManifest,
  locations: Locations,
  repoBase: string,
): ResolvedRoot[] {
  return resolveRootPaths(manifest, locations, repoBase, io.fileSystem);
}

/** The manifest in `repoBase`, or an empty one when none exists. */
export function loadUnifiedManifest(io: Io, repoBase: string): UnifiedManifest {
  const { fileSystem } = io;
  const file = path.join(repoBase, MANIFEST_RELATIVE);
  if (!fileSystem.exists(file)) return { version: 2, roots: {}, entries: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileSystem.readText(file));
  } catch {
    throw new Error(`Cannot read ai-sync manifest: ${file}`);
  }
  return validateManifest(io, parsed, repoBase);
}

/** Validates, then atomically writes the manifest into `repoBase`. */
export function saveUnifiedManifest(io: Io, repoBase: string, manifest: UnifiedManifest): void {
  const valid = validateManifest(io, manifest, repoBase);
  const file = path.join(repoBase, MANIFEST_RELATIVE);
  io.fileSystem.writeTextAtomic(file, `${JSON.stringify(valid, null, 2)}\n`);
}

/** Local root bindings from `file` (default: the environment's locations file), or none. */
export function loadLocations(io: Io, file: string = io.environment.locationsFile): Locations {
  const { fileSystem } = io;
  if (!fileSystem.exists(file)) return { version: 1, roots: {} };
  let value: unknown;
  try {
    value = JSON.parse(fileSystem.readText(file));
  } catch {
    throw new Error(`Cannot read ai-sync locations: ${file}`);
  }
  return validateLocations(io, value);
}

/** Atomically writes local root bindings to `file`. */
export function saveLocations(io: Io, file: string, locations: Locations): void {
  if (locations.version !== 1) throw new Error("Invalid ai-sync locations version");
  io.fileSystem.writeTextAtomic(file, `${JSON.stringify(locations, null, 2)}\n`);
}

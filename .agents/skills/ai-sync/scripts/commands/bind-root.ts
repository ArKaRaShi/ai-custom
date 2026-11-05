import type { Io } from "@/scripts/io/io";
import {
  loadLocations,
  loadUnifiedManifest,
  saveLocations,
  validateLocations,
} from "@/scripts/lib/manifest-repository";

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

export function bindRoot(io: Io, input: BindRootInput): BindRootOutput {
  const { environment } = io;
  const { id, localRoot, repoBase } = input;
  const manifest = loadUnifiedManifest(io, repoBase);
  if (!manifest.roots[id]) throw new Error(`Unknown root: ${id}`);
  const locations = loadLocations(io);
  const next = { version: 1 as const, roots: { ...locations.roots, [id]: localRoot } };
  const validated = validateLocations(io, next);
  saveLocations(io, environment.locationsFile, validated);
  return { id, local: String(validated.roots[id]) };
}

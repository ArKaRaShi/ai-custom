import * as path from "node:path";
import type { Io } from "@/scripts/io/io";
import { loadUnifiedManifest, saveUnifiedManifest } from "@/scripts/lib/manifest-repository";

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

export function initRepository(io: Io, input: InitRepositoryInput): InitRepositoryOutput {
  const { fileSystem } = io;
  const { repoBase } = input;
  const manifest = loadUnifiedManifest(io, repoBase);
  const manifestFile = path.join(repoBase, ".ai-sync", "manifest.json");
  if (fileSystem.exists(manifestFile)) {
    return { created: false, rootCount: Object.keys(manifest.roots).length, manifestFile };
  }
  saveUnifiedManifest(io, repoBase, { version: 2, roots: {}, entries: [] });
  return { created: true, rootCount: 0, manifestFile };
}

import type { Io } from "@/scripts/io/io";
import type { RootKind } from "@/scripts/lib/manifest";
import { loadUnifiedManifest, saveUnifiedManifest } from "@/scripts/lib/manifest-repository";

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

export function addRoot(io: Io, input: AddRootInput): AddRootOutput {
  const { id, kind, repoRoot, repoBase } = input;
  const manifest = loadUnifiedManifest(io, repoBase);
  manifest.roots[id] = { kind, repoRoot };
  saveUnifiedManifest(io, repoBase, manifest);
  return { id, kind, repoRoot };
}

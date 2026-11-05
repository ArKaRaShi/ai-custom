import type { Io } from "@/scripts/io/io";
import type { SyncEntry } from "@/scripts/lib/manifest";
import { loadUnifiedManifest, saveUnifiedManifest } from "@/scripts/lib/manifest-repository";

export interface TrackPathInput {
  pattern: string;
  rootId: string;
  sync: boolean;
  repoBase: string;
  version?: string;
}

export interface TrackPathOutput {
  rootId: string;
  pattern: string;
  sync: boolean;
}

/**
 * Register or re-register a file rule. A recorded version label survives re-registration and
 * policy toggles; it changes only when `version` is given, and is never invented.
 */
export function trackPath(io: Io, input: TrackPathInput): TrackPathOutput {
  const { pattern, rootId, sync, repoBase, version } = input;
  const manifest = loadUnifiedManifest(io, repoBase);
  if (manifest.roots[rootId]?.kind !== "path") {
    throw new Error(`Unknown or non-path root: ${rootId}`);
  }
  const existing = manifest.entries.find(
    (item) => item.kind === "path" && item.root === rootId && item.path === pattern,
  );
  const label = version ?? (existing?.kind === "path" ? existing.version : undefined);
  const entry: SyncEntry = {
    kind: "path",
    root: rootId,
    path: pattern,
    sync,
    ...(label !== undefined ? { version: label } : {}),
  };
  // Rule order decides precedence, so an entry moves to the end only when its policy changes; a
  // label-only edit stays in place and leaves the policy fingerprint untouched.
  const index = manifest.entries.findIndex(
    (item) => item.kind === "path" && item.root === rootId && item.path === pattern,
  );
  if (existing?.sync === sync) manifest.entries[index] = entry;
  else {
    manifest.entries = manifest.entries.filter((item) => item !== existing);
    manifest.entries.push(entry);
  }
  saveUnifiedManifest(io, repoBase, manifest);
  return { rootId, pattern, sync };
}

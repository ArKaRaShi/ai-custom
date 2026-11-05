import * as path from "node:path";
import type { Io } from "@/scripts/io/io";
import type { UnifiedManifest } from "@/scripts/lib/manifest";
import {
  loadLocations,
  loadUnifiedManifest,
  saveUnifiedManifest,
} from "@/scripts/lib/manifest-repository";
import { pathRuleMatches } from "@/scripts/lib/target-matcher";

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

export function discoverCandidates(
  io: Io,
  input: DiscoverCandidatesInput,
): DiscoverCandidatesOutput {
  const { fileSystem, reporter } = io;
  const { repoBase, write } = input;
  const manifest = loadUnifiedManifest(io, repoBase);
  const locations = loadLocations(io);
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
        if (entry.kind === "path" && entry.root === id && pathRuleMatches(io, entry, rel)) {
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
  if (write) saveUnifiedManifest(io, repoBase, manifest);
  return { manifest, write, recorded };
}

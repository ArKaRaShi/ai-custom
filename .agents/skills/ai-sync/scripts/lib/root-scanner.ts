import * as path from "node:path";
import type { Io } from "@/scripts/io/io";
import {
  loadLocations,
  loadUnifiedManifest,
  resolveRoots,
} from "@/scripts/lib/manifest-repository";
import { resolvedPathId } from "@/scripts/lib/plan";
import {
  type EntryState,
  type ExcludedCopy,
  entryIdentity,
  type LoadedRoots,
  type PruneScan,
  type ResolvedSyncTarget,
  type ScanEntry,
  type ScanResult,
} from "@/scripts/lib/scan";
import { isExcludedByPolicy, pathRuleMatches } from "@/scripts/lib/target-matcher";
import type { SyncOptions } from "@/scripts/lib/targets";
import { matchesPattern } from "@/scripts/lib/targets";

const toPosix = (value: string): string => value.split(path.sep).join("/");

// Reads the manifest and both sides of every sync root to report drift. Read-only.

/**
 * The manifest in `repoBase` with each root resolved through this machine's bindings. A root with no
 * binding aborts the load, unless `boundOnly` drops it (and its entries) so a read-only report can cover the rest.
 */
export function loadRoots(
  io: Io,
  repoBase: string,
  { boundOnly = false }: { boundOnly?: boolean } = {},
): LoadedRoots {
  const loaded = loadUnifiedManifest(io, repoBase);
  const locations = loadLocations(io);
  let manifest = loaded;
  if (boundOnly) {
    const boundRoots = Object.entries(loaded.roots).filter(([id]) => locations.roots[id]);
    manifest = {
      ...loaded,
      roots: Object.fromEntries(boundRoots),
      entries: loaded.entries.filter((entry) => locations.roots[entry.root]),
    };
  }
  const roots = resolveRoots(io, manifest, locations, repoBase);
  return { manifest, roots };
}

/** Path roots as one target each; skill roots as one target per synced skill. */
export function getSyncTargets(
  io: Io,
  repoBase: string,
  loaded: LoadedRoots = loadRoots(io, repoBase),
): ResolvedSyncTarget[] {
  const { manifest, roots } = loaded;
  const targets: ResolvedSyncTarget[] = [];
  for (const root of roots) {
    const entries = manifest.entries.filter((entry) => entry.root === root.id);
    if (root.kind === "path") {
      targets.push({ ...root, name: root.id, category: root.id, rootId: root.id, entries });
    } else {
      for (const entry of entries) {
        if (entry.kind === "skill" && entry.sync) {
          targets.push({
            local: path.join(root.local, entry.path),
            repo: path.join(root.repo, entry.path),
            name: entry.path,
            category: "skills",
            rootId: root.id,
            entries: [entry],
          });
        }
      }
    }
  }
  return targets;
}

/** Every policy-allowed file in every sync root, with its drift state. Read-only. */
export function scanTargets(
  io: Io,
  repoBase: string,
  opts: SyncOptions = {},
  loaded: LoadedRoots = loadRoots(io, repoBase),
): ScanResult {
  const { fileSystem, git } = io;
  const syncTargets = getSyncTargets(io, repoBase, loaded);
  const entries: ScanEntry[] = [];

  for (const item of syncTargets) {
    const adjustedRepo = item.repo;
    const itemName = item.category === "skills" ? item.name : undefined;
    const rootRelative = (rel: string): string => (itemName ? `${itemName}/${rel}` : rel);
    const policyAllows = (relativePath: string): boolean => {
      if (item.category === "skills") return true;
      let allowed = false;
      for (const entry of item.entries) {
        if (entry.kind === "path" && pathRuleMatches(io, entry, relativePath)) {
          allowed = entry.sync;
        }
      }
      return allowed;
    };
    const excluded = (rel: string): boolean => !!opts.exclude && matchesPattern(rel, opts.exclude);

    if (fileSystem.exists(item.local) && fileSystem.stat(item.local).isFile) {
      const rel = path.basename(item.local);
      if (!policyAllows(rel) || excluded(rel)) continue;
      const state: EntryState = !fileSystem.exists(adjustedRepo)
        ? "new_local"
        : fileSystem.sha256(item.local) !== fileSystem.sha256(adjustedRepo)
          ? "modified"
          : "in_sync";
      entries.push({
        root: item.rootId,
        item: itemName,
        path: rootRelative(rel),
        local: item.local,
        repo: adjustedRepo,
        state,
      });
      continue;
    }

    const localRelMap = new Map<string, string>();
    for (const lf of fileSystem.getAllFiles(item.local)) {
      const rel = toPosix(path.relative(item.local, lf));
      if (policyAllows(rel) && !excluded(rel)) localRelMap.set(rel, lf);
    }
    const repoRelMap = new Map<string, string>();
    for (const rf of fileSystem.getAllFiles(adjustedRepo)) {
      const rel = toPosix(path.relative(adjustedRepo, rf));
      if (policyAllows(rel) && !excluded(rel)) repoRelMap.set(rel, rf);
    }

    // Files only on the machine that the repo's own .gitignore excludes
    // (e.g. `vale sync`-downloaded packages) are intentional, not drift.
    const candidateRels = [...localRelMap.keys()].filter((rel) => !repoRelMap.has(rel));
    const candidateRepoRels = candidateRels.map((rel) =>
      path.relative(repoBase, path.join(adjustedRepo, rel)),
    );
    const ignoredSet = git.ignoredPaths(repoBase, candidateRepoRels);

    for (const [rel, localPath] of localRelMap) {
      const repoPath = repoRelMap.get(rel);
      const base = {
        root: item.rootId,
        item: itemName,
        path: rootRelative(rel),
        local: localPath,
      };
      if (!repoPath) {
        const repoCandidate = path.join(adjustedRepo, rel);
        if (!ignoredSet.has(path.relative(repoBase, repoCandidate))) {
          entries.push({ ...base, repo: repoCandidate, state: "new_local" });
        }
      } else {
        entries.push({
          ...base,
          repo: repoPath,
          state:
            fileSystem.sha256(localPath) !== fileSystem.sha256(repoPath) ? "modified" : "in_sync",
        });
      }
    }
    for (const [rel, repoPath] of repoRelMap) {
      if (!localRelMap.has(rel)) {
        entries.push({
          root: item.rootId,
          item: itemName,
          path: rootRelative(rel),
          local: path.join(item.local, rel),
          repo: repoPath,
          state: "new_repo",
        });
      }
    }
  }

  entries.sort((a, b) =>
    entryIdentity(a) < entryIdentity(b) ? -1 : entryIdentity(a) > entryIdentity(b) ? 1 : 0,
  );
  return {
    ...loaded,
    entries,
    itemNames: syncTargets.filter((item) => item.category === "skills").map((item) => item.name),
  };
}

/** Every backup file whose item the policy excludes, committed or not. Read-only. */
export function scanExcludedCopies(
  io: Io,
  repoBase: string,
  opts: SyncOptions = {},
  loaded: LoadedRoots = loadRoots(io, repoBase),
): PruneScan {
  const { fileSystem } = io;
  const found = new Map<string, ExcludedCopy>();

  for (const root of loaded.roots) {
    const bases: { dir: string; item?: string }[] =
      root.kind === "path"
        ? [{ dir: root.repo }]
        : loaded.manifest.entries.flatMap((entry) =>
            entry.kind === "skill" && entry.root === root.id && !entry.sync
              ? [{ dir: path.join(root.repo, entry.path), item: entry.path }]
              : [],
          );
    for (const { dir, item } of bases) {
      for (const file of fileSystem.getAllFiles(dir)) {
        const singleFile = root.kind === "path" && file === root.repo;
        const rel = singleFile
          ? path.basename(root.local)
          : toPosix(path.relative(root.repo, file));
        if (!isExcludedByPolicy(io, loaded.manifest, root.id, rel)) continue;
        if (opts.exclude && matchesPattern(rel, opts.exclude)) continue;
        if (found.has(file)) continue;
        found.set(file, {
          root: root.id,
          item,
          path: rel,
          local: singleFile ? root.local : path.join(root.local, ...rel.split("/")),
          repo: file,
        });
      }
    }
  }

  const copies = [...found.values()].sort((a, b) => {
    const left = resolvedPathId(a.root, a.path);
    const right = resolvedPathId(b.root, b.path);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return { ...loaded, copies };
}

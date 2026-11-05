import type { Io } from "@/scripts/io/io";
import type { PathEntry, UnifiedManifest } from "@/scripts/lib/manifest";
import { isExcludedByPolicy as isExcludedByPolicyWith } from "@/scripts/lib/scan";
import {
  filterItems as filterItemsWith,
  matchesTarget as matchesTargetWith,
  type SyncOptions,
  type TargetCandidate,
} from "@/scripts/lib/targets";

/** True when an explicit target (root id, item, path, `<root>:<path>`, or glob) selects the candidate. */
export function matchesTarget(io: Io, rawTarget: string, candidate: TargetCandidate): boolean {
  return matchesTargetWith(rawTarget, candidate, (pattern, value) =>
    io.globMatcher.matches(pattern, value),
  );
}

/** Applies `targets` then `exclude` from `opts` to bare paths. */
export function filterItems(io: Io, paths: string[], opts: SyncOptions = {}): string[] {
  return filterItemsWith(paths, opts, (pattern, value) => io.globMatcher.matches(pattern, value));
}

/** True when a path entry's gitignore-style rule ignores `relativePath`. */
export function pathRuleMatches(io: Io, entry: PathEntry, relativePath: string): boolean {
  return io.globMatcher.ruleMatches(entry.path, relativePath);
}

/** True when the policy names this file's item and says it does not sync. */
export function isExcludedByPolicy(
  io: Io,
  manifest: UnifiedManifest,
  rootId: string,
  relPath: string,
): boolean {
  return isExcludedByPolicyWith(manifest, rootId, relPath, (entry, rel) =>
    pathRuleMatches(io, entry, rel),
  );
}

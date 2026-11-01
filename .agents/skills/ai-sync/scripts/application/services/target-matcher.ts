import type { GlobMatcher } from "@/scripts/application/interfaces/glob-matcher";
import type { PathEntry, UnifiedManifest } from "@/scripts/domain/manifest";
import { isExcludedByPolicy } from "@/scripts/domain/scan";
import {
  filterItems,
  matchesPattern,
  matchesTarget,
  type SyncOptions,
  type TargetCandidate,
} from "@/scripts/domain/targets";

/** Target, exclude-pattern, and policy-rule matching backed by a GlobMatcher. */
export class TargetMatcher {
  constructor(private readonly globMatcher: GlobMatcher) {}

  /** True when an explicit target (root id, item, path, `<root>:<path>`, or glob) selects the candidate. */
  matchesTarget(rawTarget: string, candidate: TargetCandidate): boolean {
    return matchesTarget(rawTarget, candidate, (pattern, value) =>
      this.globMatcher.matches(pattern, value),
    );
  }

  /** True when any `--exclude` pattern covers the root-relative path. */
  matchesPattern(relPath: string, patterns: string[]): boolean {
    return matchesPattern(relPath, patterns);
  }

  /** Applies `targets` then `exclude` from `opts` to bare paths. */
  filterItems(paths: string[], opts: SyncOptions = {}): string[] {
    return filterItems(paths, opts, (pattern, value) => this.globMatcher.matches(pattern, value));
  }

  /** True when a path entry's gitignore-style rule ignores `relativePath`. */
  pathRuleMatches(entry: PathEntry, relativePath: string): boolean {
    return this.globMatcher.ruleMatches(entry.path, relativePath);
  }

  /** True when the policy names this file's item and says it does not sync. */
  isExcludedByPolicy(manifest: UnifiedManifest, rootId: string, relPath: string): boolean {
    return isExcludedByPolicy(manifest, rootId, relPath, (entry, rel) =>
      this.pathRuleMatches(entry, rel),
    );
  }
}

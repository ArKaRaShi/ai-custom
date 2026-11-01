export interface SyncOptions {
  /**
   * Explicit selections. Each is a root id, a skill item name, a root-relative
   * file or directory path, `<root>:<path>`, or a glob over those. Matching is
   * exact or glob, never substring.
   */
  targets?: string[];
  exclude?: string[];
  format?: "tree" | "json";
  apply?: boolean;
  /** retained only to ensure this flag cannot alter manifest policy */
  includeLocal?: boolean;
  /** persist detected entries during discovery */
  write?: boolean;
  gitPull?: boolean;
  gitPush?: boolean;
  commitMessage?: string;
  /** write the preview as a saved change plan to this file */
  planOut?: string;
  /** `<root>:<skill>` ids whose recorded installer commands the user approved for bootstrap to run */
  approveInstall?: string[];
}

/** A managed file as seen by target matching. `path` is root-relative with `/` separators. */
export interface TargetCandidate {
  root: string;
  path: string;
  /** skill name for skill roots */
  item?: string;
}

/** Glob test: does `value` match `pattern`? Supplied by an adapter. */
export type GlobTest = (pattern: string, value: string) => boolean;

/** Target test over a candidate, as supplied by a TargetMatcher. */
export type TargetTest = (rawTarget: string, candidate: TargetCandidate) => boolean;

const GLOB_CHARS = /[*?[\]{}]/;

export function matchesPattern(relPath: string, patterns: string[]): boolean {
  if (!patterns || patterns.length === 0) return false;
  const normalized = relPath.replace(/\\/g, "/");
  return patterns.some((p) => {
    const cleaned = p.trim().replace(/\\/g, "/");
    if (!cleaned) return false;
    if (cleaned.startsWith("*.")) {
      const ext = cleaned.slice(1);
      return normalized.endsWith(ext);
    }
    const parts = normalized.split("/");
    return (
      parts.includes(cleaned) ||
      normalized === cleaned ||
      normalized.startsWith(`${cleaned}/`) ||
      normalized.includes(`/${cleaned}/`) ||
      normalized.endsWith(`/${cleaned}`)
    );
  });
}

export function normalizeTarget(target: string): string {
  return target.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

export function isGlobTarget(target: string): boolean {
  return GLOB_CHARS.test(target);
}

/** A target made only of wildcards selects everything and so carries no explicit scope. */
export function isUnboundedTarget(target: string): boolean {
  return /^[*?/]*$/.test(normalizeTarget(target));
}

function nameMatches(pattern: string, value: string, glob: GlobTest): boolean {
  if (!isGlobTarget(pattern)) return pattern === value;
  return glob(pattern, value);
}

/** A path pattern selects a file, or any directory above it, exactly or by glob. */
function pathMatches(pattern: string, relPath: string, glob: GlobTest): boolean {
  const segments = relPath.split("/");
  for (let i = 1; i <= segments.length; i++) {
    if (nameMatches(pattern, segments.slice(0, i).join("/"), glob)) return true;
  }
  return false;
}

export function matchesTarget(
  rawTarget: string,
  candidate: TargetCandidate,
  glob: GlobTest,
): boolean {
  const target = normalizeTarget(rawTarget);
  if (!target) return false;
  if (candidate.root && target.startsWith(`${candidate.root}:`)) {
    const rest = target.slice(candidate.root.length + 1);
    return rest === "" || pathMatches(rest, candidate.path, glob);
  }
  if (candidate.root && nameMatches(target, candidate.root, glob)) return true;
  if (candidate.item && nameMatches(target, candidate.item, glob)) return true;
  return pathMatches(target, candidate.path, glob);
}

export function filterItems(paths: string[], opts: SyncOptions, glob: GlobTest): string[] {
  let result = paths;
  const targets = opts.targets;
  if (targets && targets.length > 0) {
    result = result.filter((p) =>
      targets.some((t) => matchesTarget(t, { root: "", path: p }, glob)),
    );
  }
  const exclude = opts.exclude;
  if (exclude && exclude.length > 0) {
    result = result.filter((p) => !matchesPattern(p, exclude));
  }
  return result;
}

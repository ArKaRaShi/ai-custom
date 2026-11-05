import ignore from "ignore";

const globs = new Map<string, InstanceType<typeof Bun.Glob>>();

/** Bun glob and gitignore-rule matching; `io.globMatcher`. */
export const globMatcher = {
  /** True when `value` matches the glob `pattern` (Bun.Glob semantics). */
  matches(pattern: string, value: string): boolean {
    let glob = globs.get(pattern);
    if (!glob) {
      glob = new Bun.Glob(pattern);
      globs.set(pattern, glob);
    }
    return glob.match(value);
  },

  /** True when a gitignore-style `rule` ignores `relativePath` (`\` is treated as `/`). */
  ruleMatches(rule: string, relativePath: string): boolean {
    return ignore().add(rule).ignores(relativePath.replace(/\\/g, "/"));
  },

  /** True when `rule` is a syntactically valid gitignore-style rule. */
  isValidRule(rule: string): boolean {
    try {
      ignore().add(rule);
      return true;
    } catch {
      return false;
    }
  },
};

export type GlobMatcher = typeof globMatcher;

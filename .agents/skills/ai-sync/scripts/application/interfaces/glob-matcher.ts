export interface GlobMatcher {
  /** True when `value` matches the glob `pattern` (Bun.Glob semantics). */
  matches(pattern: string, value: string): boolean;
  /** True when a gitignore-style `rule` ignores `relativePath` (`\` is treated as `/`). */
  ruleMatches(rule: string, relativePath: string): boolean;
  /** True when `rule` is a syntactically valid gitignore-style rule. */
  isValidRule(rule: string): boolean;
}

import ignore from "ignore";
import type { GlobMatcher } from "@/scripts/application/interfaces/glob-matcher";

export class BunGlobMatcher implements GlobMatcher {
  private readonly globs = new Map<string, InstanceType<typeof Bun.Glob>>();

  matches(pattern: string, value: string): boolean {
    let glob = this.globs.get(pattern);
    if (!glob) {
      glob = new Bun.Glob(pattern);
      this.globs.set(pattern, glob);
    }
    return glob.match(value);
  }

  ruleMatches(rule: string, relativePath: string): boolean {
    return ignore().add(rule).ignores(relativePath.replace(/\\/g, "/"));
  }

  isValidRule(rule: string): boolean {
    try {
      ignore().add(rule);
      return true;
    } catch {
      return false;
    }
  }
}

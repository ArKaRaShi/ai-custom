#!/usr/bin/env bun
import * as os from "os";
import * as path from "path";

export const HOME = os.homedir();
export const DEFAULT_REPO = process.env.AI_CUSTOM_REPO || path.join(HOME, "Disk", "ai-custom");
export const SKILLS_DIR = process.env.AGENTS_SKILLS_DIR || path.join(HOME, ".agents", "skills");


export interface SyncOptions {
  target?: string;
  exclude?: string[];
  format?: "tree" | "json";
  apply?: boolean;
  /** retained only to ensure this flag cannot alter manifest policy */
  includeLocal?: boolean;
  /** persist detected entries during discovery */
  write?: boolean;
}

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
      normalized.startsWith(cleaned + "/") ||
      normalized.includes("/" + cleaned + "/") ||
      normalized.endsWith("/" + cleaned)
    );
  });
}

export function filterItems(paths: string[], opts: SyncOptions = {}): string[] {
  let result = paths;
  if (opts.target) {
    const t = opts.target.toLowerCase();
    result = result.filter((p) => p.toLowerCase().includes(t));
  }
  if (opts.exclude && opts.exclude.length > 0) {
    result = result.filter((p) => !matchesPattern(p, opts.exclude!));
  }
  return result;
}

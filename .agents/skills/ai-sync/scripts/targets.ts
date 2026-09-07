#!/usr/bin/env bun
import * as os from "os";
import * as path from "path";

export const HOME = os.homedir();
export const DEFAULT_REPO = process.env.AI_CUSTOM_REPO || path.join(HOME, "Disk", "ai-custom");
export const SKILLS_DIR = process.env.AGENTS_SKILLS_DIR || path.join(HOME, ".agents", "skills");

export interface SyncTarget {
  local: string;
  repo: string;
  name: string;
  category: string;
}

export const TARGET_MAP: Array<SyncTarget> = [
  {
    name: "OMP Config",
    category: "config",
    local: path.join(HOME, ".omp", "agent", "config.yml"),
    repo: path.join(DEFAULT_REPO, ".omp", "config.yml"),
  },
  {
    name: "OMP MCP",
    category: "mcp",
    local: path.join(HOME, ".omp", "agent", "mcp.json"),
    repo: path.join(DEFAULT_REPO, ".omp", "mcp.json"),
  },
  {
    name: "OMP Instructions",
    category: "instructions",
    local: path.join(HOME, ".omp", "agent", "AGENTS.md"),
    repo: path.join(DEFAULT_REPO, ".omp", "AGENTS.md"),
  },
  {
    name: "OMP Agents",
    category: "agents",
    local: path.join(HOME, ".omp", "agent", "agents"),
    repo: path.join(DEFAULT_REPO, ".omp", "agents"),
  },
  {
    name: "OMP Extensions",
    category: "extensions",
    local: path.join(HOME, ".omp", "agent", "extensions"),
    repo: path.join(DEFAULT_REPO, ".omp", "extensions"),
  },
  {
    name: "OMP Rules",
    category: "rules",
    local: path.join(HOME, ".omp", "agent", "rules"),
    repo: path.join(DEFAULT_REPO, ".omp", "rules"),
  },
  {
    name: "OMP Hooks",
    category: "hooks",
    local: path.join(HOME, ".omp", "agent", "hooks"),
    repo: path.join(DEFAULT_REPO, ".omp", "hooks"),
  },
  {
    name: "OMP Tests",
    category: "tests",
    local: path.join(HOME, ".omp", "agent", "tests"),
    repo: path.join(DEFAULT_REPO, ".omp", "tests"),
  },
  {
    name: "User Skills",
    category: "skills",
    local: SKILLS_DIR,
    repo: path.join(DEFAULT_REPO, ".agents", "skills"),
  },
];

export interface SyncOptions {
  target?: string;
  exclude?: string[];
  /** bypass origin filtering: include external/local skills in sync ops */
  includeLocal?: boolean;
  /** persist auto-detected manifest entries during discovery */
  write?: boolean;
  /** apply a manifest cleanup after printing its candidates */
  apply?: boolean;
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

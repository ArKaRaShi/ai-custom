#!/usr/bin/env bun
import * as fs from "fs";
import * as path from "path";
import ignore from "ignore";
import { DEFAULT_REPO, TARGET_MAP } from "./targets";

export interface PathRule {
  pattern: string;
  sync: boolean;
}

export interface PathManifest {
  version: 1;
  rules: PathRule[];
}

export const PATH_MANIFEST_RELATIVE = ".ai-sync/manifest.json";

function allowedRoots(repoBase: string): string[] {
  return TARGET_MAP.filter((target) => target.category !== "skills").map((target) => {
    const targetRepo = target.repo.replace(DEFAULT_REPO, repoBase);
    return path.relative(repoBase, targetRepo).replace(/\\/g, "/");
  });
}

export function normalizePolicyPattern(pattern: string, repoBase: string): string {
  const normalized = pattern.replace(/\\/g, "/");
  if (
    !normalized ||
    normalized !== normalized.trim() ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    normalized.startsWith("!") ||
    normalized.startsWith("#") ||
    /[\0\r\n]/.test(normalized) ||
    normalized.split("/").some((part) => part === ".." || part === ".")
  ) {
    throw new Error(`Invalid repo-relative sync path: ${pattern}`);
  }

  let validPattern = false;
  for (const root of allowedRoots(repoBase)) {
    if (normalized === root || normalized.startsWith(root + "/")) {
      validPattern = true;
      break;
    }
  }
  if (!validPattern) {
    throw new Error(`Sync path is outside non-skill targets: ${pattern}`);
  }

  try {
    ignore().add(normalized);
  } catch {
    throw new Error(`Invalid sync pattern: ${pattern}`);
  }
  return normalized;
}

function validateManifest(value: unknown, repoBase: string): PathManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid ai-sync path manifest: expected an object");
  }
  const manifest = value as { version?: unknown; rules?: unknown };
  if (manifest.version !== 1 || !Array.isArray(manifest.rules)) {
    throw new Error("Invalid ai-sync path manifest: unsupported format");
  }

  const rules: PathRule[] = [];
  for (const item of manifest.rules) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Invalid ai-sync path rule");
    }
    const rule = item as { pattern?: unknown; sync?: unknown };
    if (typeof rule.pattern !== "string" || typeof rule.sync !== "boolean") {
      throw new Error("Invalid ai-sync path rule");
    }
    const pattern = normalizePolicyPattern(rule.pattern, repoBase);
    try {
      ignore().add(pattern);
    } catch {
      throw new Error(`Invalid sync pattern: ${pattern}`);
    }
    rules.push({ pattern, sync: rule.sync });
  }
  return { version: 1, rules };
}

export function loadPathManifest(repoBase: string): PathManifest {
  const file = path.join(repoBase, PATH_MANIFEST_RELATIVE);
  if (!fs.existsSync(file)) return { version: 1, rules: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new Error(`Cannot read ai-sync path manifest: ${file}`);
  }
  return validateManifest(parsed, repoBase);
}

export function savePathManifest(repoBase: string, value: PathManifest): void {
  const manifest = validateManifest(value, repoBase);
  const file = path.join(repoBase, PATH_MANIFEST_RELATIVE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

export function setPathRule(manifest: PathManifest, pattern: string, sync: boolean): PathManifest {
  const rules = manifest.rules.filter((rule) => rule.pattern !== pattern);
  rules.push({ pattern, sync });
  return { version: 1, rules };
}

export function createPathMatcher(manifest: PathManifest): (repoRelativePath: string) => boolean {
  const compiled = manifest.rules.map((rule) => ({ matcher: ignore().add(rule.pattern), sync: rule.sync }));
  return (repoRelativePath: string): boolean => {
    const normalized = repoRelativePath.replace(/\\/g, "/");
    let sync = false;
    for (const rule of compiled) {
      if (rule.matcher.ignores(normalized)) sync = rule.sync;
    }
    return sync;
  };
}

export function isPathSynced(repoRelativePath: string, manifest: PathManifest): boolean {
  return createPathMatcher(manifest)(repoRelativePath);
}

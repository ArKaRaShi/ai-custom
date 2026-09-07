#!/usr/bin/env bun
import * as fs from "fs";
import * as path from "path";
import { HOME, SKILLS_DIR, DEFAULT_REPO, SyncOptions } from "./targets";

export type SkillOrigin = "authored" | "external";

export interface SkillManifestEntry {
  origin: SkillOrigin;
  sync: boolean;
  source?: string;
  sourceType?: string;
  skillPath?: string;
  version?: string;
  install?: string;
  description?: string;
  detectionReason?: string;
}

export interface SkillsLock {
  version?: number;
  skills?: Record<string, {
    source?: string;
    sourceType?: string;
    skillPath?: string;
    computedHash?: string;
  }>;
}

export const SKILLS_LOCK_FILE = path.join(HOME, "skills-lock.json");

export function loadSkillsLock(file = SKILLS_LOCK_FILE): SkillsLock {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8")) as SkillsLock;
    }
  } catch {}
  return {};
}

/** Inspects a local skill and returns the detected origin, sync flag, and provenance reason */
export function autoDetectSkill(
  skillName: string,
  skillDir: string,
  repoSkillsDir: string,
  skillsLock: SkillsLock = loadSkillsLock(),
  sharedManifest: SkillsManifest = { version: 1, skills: {} },
): SkillManifestEntry {
  // 1. If repo shared manifest explicitly recorded this skill, honor it
  if (sharedManifest.skills[skillName]) {
    const existing = sharedManifest.skills[skillName];
    return {
      ...existing,
      detectionReason: `from repo manifest (sync: ${existing.sync})`,
    };
  }

  // 2. If it's already committed as an authored directory in the repo
  const inRepo = path.join(repoSkillsDir, skillName);
  if (fs.existsSync(inRepo) && fs.statSync(inRepo).isDirectory()) {
    return {
      origin: "authored",
      sync: true,
      detectionReason: "matched in repo",
    };
  }

  // 3. If it's registered in ~/skills-lock.json (skills.sh ecosystem)
  if (skillsLock.skills && skillsLock.skills[skillName]) {
    const lockEntry = skillsLock.skills[skillName];
    return {
      origin: "external",
      sync: false,
      source: lockEntry.source,
      sourceType: lockEntry.sourceType || "github",
      skillPath: lockEntry.skillPath,
      install: lockEntry.source ? `npx skills add ${lockEntry.source} -g` : undefined,
      detectionReason: `detected via ~/skills-lock.json (${lockEntry.source || "external"})`,
    };
  }

  // 4. Inspect SKILL.md frontmatter or content for upstream signals (GitHub URL, author, etc.)
  const skillMdPath = path.join(skillDir, "SKILL.md");
  if (fs.existsSync(skillMdPath)) {
    try {
      const content = fs.readFileSync(skillMdPath, "utf8");
      const ghMatch = content.match(/github\.com\/([a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+)/);
      const authorMatch = content.match(/author:\s*([^\n\r]+)/i);
      const versionMatch = content.match(/version:\s*["']?([^"'\n\r]+)["']?/i);
      if (ghMatch || authorMatch) {
        const source = ghMatch ? ghMatch[1] : undefined;
        const version = versionMatch ? versionMatch[1] : undefined;
        return {
          origin: "external",
          sync: false,
          source,
          sourceType: source ? "github" : undefined,
          version,
          install: source ? `npx skills add ${source} -g` : undefined,
          detectionReason: `detected via SKILL.md (${source || authorMatch?.[1]?.trim() || "external metadata"})`,
        };
      }
    } catch {}
  }

  // 5. Default to machine-local scratchpad (sync: false so it never leaks to git)
  return {
    origin: "authored",
    sync: false,
    detectionReason: "no upstream detected, private to this machine",
  };
}

export interface SkillsManifest {
  version: number;
  skills: Record<string, SkillManifestEntry>;
}

export const MANIFEST_FILENAME = "skills-manifest.json";
export const LOCAL_MANIFEST_FILE = path.join(SKILLS_DIR, MANIFEST_FILENAME);

/** The shared manifest belongs beside the repository's synchronized skills. */
export function repoManifestPath(repoBase = DEFAULT_REPO): string {
  return path.join(repoBase, ".agents", "skills", MANIFEST_FILENAME);
}

/** Remove one manifest entry without changing any skill files. */
export function removeManifestEntry(manifest: SkillsManifest, skill: string): boolean {
  if (!manifest.skills[skill]) return false;
  delete manifest.skills[skill];
  return true;
}

/** Remove one skill from local and shared manifests without deleting the skill itself. */
export function untrackSkill(
  skill: string,
  localManifestFile = LOCAL_MANIFEST_FILE,
  sharedManifestFile = repoManifestPath(),
): { local: boolean; shared: boolean } {
  const localManifest = loadManifest(localManifestFile);
  const sharedManifest = loadManifest(sharedManifestFile);
  const local = removeManifestEntry(localManifest, skill);
  const shared = removeManifestEntry(sharedManifest, skill);
  if (local) saveManifest(localManifestFile, localManifest);
  if (shared) saveManifest(sharedManifestFile, sharedManifest);
  return { local, shared };
}

/** Remove manifest records whose skill directories are absent. */
export function removeOrphanedManifestEntries(manifest: SkillsManifest, installedSkills: string[]): string[] {
  const installed = new Set(installedSkills);
  const orphaned = Object.keys(manifest.skills).filter((name) => !installed.has(name));
  for (const name of orphaned) delete manifest.skills[name];
  return orphaned;
}

/** Move a legacy root manifest into the canonical skills target without overwriting it. */
export function migrateLegacyManifest(legacyManifestFile: string, canonicalManifestFile: string): boolean {
  if (!fs.existsSync(legacyManifestFile) || fs.existsSync(canonicalManifestFile)) return false;
  fs.mkdirSync(path.dirname(canonicalManifestFile), { recursive: true });
  fs.renameSync(legacyManifestFile, canonicalManifestFile);
  return true;
}

export function loadManifest(manifestPath: string): SkillsManifest {
  try {
    if (fs.existsSync(manifestPath)) {
      return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as SkillsManifest;
    }
  } catch {}
  return { version: 1, skills: {} };
}

export function saveManifest(manifestPath: string, data: SkillsManifest): void {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

/** Augment exclude list so skills with sync: false never cross into git backup. */
export function withOriginFilter(opts: SyncOptions = {}, manifest: SkillsManifest = loadManifest(LOCAL_MANIFEST_FILE)): SyncOptions {
  if (opts.includeLocal) return opts;
  const nonSynced = Object.entries(manifest.skills)
    .filter(([, entry]) => entry.sync !== true)
    .map(([name]) => name);
  if (nonSynced.length === 0) return opts;
  return { ...opts, exclude: [...(opts.exclude ?? []), ...nonSynced] };
}

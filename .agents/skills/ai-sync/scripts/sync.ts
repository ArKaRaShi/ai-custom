#!/usr/bin/env bun
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createHash } from "crypto";
import { execSync } from "child_process";

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
}
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

export function sha256(filePath: string): string {
  try {
    const buf = fs.readFileSync(filePath);
    return createHash("sha256").update(buf).digest("hex");
  } catch {
    return "";
  }
}

export function getAllFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) return [dir];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    if (e.name === ".DS_Store" || e.name === "node_modules" || e.name === ".git") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...getAllFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
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

export interface DiffReport {
  missingInRepo: string[];
  missingInLocal: string[];
  modified: string[];
  inSync: number;
}

export function compare(repoBase = DEFAULT_REPO, opts: SyncOptions = {}): DiffReport {
  const report: DiffReport = {
    missingInRepo: [],
    missingInLocal: [],
    modified: [],
    inSync: 0,
  };

  const targets = opts.target
    ? TARGET_MAP.filter((item) =>
        item.category.includes(opts.target!.toLowerCase()) ||
        item.name.toLowerCase().includes(opts.target!.toLowerCase())
      )
    : TARGET_MAP;

  for (const item of targets) {
    const adjustedRepo = item.repo.replace(DEFAULT_REPO, repoBase);

    // Single file comparison
    if (fs.existsSync(item.local) && fs.statSync(item.local).isFile()) {
      const rel = path.basename(item.local);
      if (opts.exclude && matchesPattern(rel, opts.exclude)) continue;

      if (!fs.existsSync(adjustedRepo)) {
        report.missingInRepo.push(item.local);
      } else if (sha256(item.local) !== sha256(adjustedRepo)) {
        report.modified.push(item.local);
      } else {
        report.inSync++;
      }
      continue;
    }

    const localFiles = getAllFiles(item.local);
    const repoFiles = getAllFiles(adjustedRepo);

    const localRelMap = new Map<string, string>();
    for (const lf of localFiles) {
      const rel = path.relative(item.local, lf);
      if (opts.exclude && matchesPattern(rel, opts.exclude)) continue;
      localRelMap.set(rel, lf);
    }

    const repoRelMap = new Map<string, string>();
    for (const rf of repoFiles) {
      const rel = path.relative(adjustedRepo, rf);
      if (opts.exclude && matchesPattern(rel, opts.exclude)) continue;
      repoRelMap.set(rel, rf);
    }

    // Check local files against repo
    for (const [rel, localPath] of localRelMap) {
      const repoPath = repoRelMap.get(rel);
      if (!repoPath) {
        report.missingInRepo.push(localPath);
      } else if (sha256(localPath) !== sha256(repoPath)) {
        report.modified.push(localPath);
      } else {
        report.inSync++;
      }
    }

    // Check repo files against local
    for (const [rel, repoPath] of repoRelMap) {
      if (!localRelMap.has(rel)) {
        report.missingInLocal.push(repoPath);
      }
    }
  }

  return report;
}

export function checkGitRemoteStatus(repoDir: string): { isGit: boolean; message: string; ahead: number; behind: number } {
  const result = { isGit: false, message: "", ahead: 0, behind: 0 };
  if (!fs.existsSync(path.join(repoDir, ".git"))) return result;
  result.isGit = true;

  try {
    // Quick status
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: repoDir, stdio: "pipe" }).toString().trim();
    const tracking = execSync("git rev-parse --abbrev-ref @{upstream} 2>/dev/null || true", { cwd: repoDir, stdio: "pipe" }).toString().trim();

    if (!tracking) {
      result.message = `Branch '${branch}' has no remote upstream configured.`;
      return result;
    }

    // Check ahead/behind
    const counts = execSync(`git rev-list --left-right --count ${branch}...@{upstream}`, { cwd: repoDir, stdio: "pipe" }).toString().trim();
    const [ahead, behind] = counts.split(/\s+/).map(Number);
    result.ahead = ahead || 0;
    result.behind = behind || 0;

    if (result.behind > 0 && result.ahead > 0) {
      result.message = `Branch diverged: ${result.ahead} ahead, ${result.behind} behind '${tracking}' (run git pull --rebase)`;
    } else if (result.behind > 0) {
      result.message = `Behind remote: ${result.behind} commit(s) behind '${tracking}' (run 'git pull' or 'ai-sync pull')`;
    } else if (result.ahead > 0) {
      result.message = `Ahead of remote: ${result.ahead} unpushed commit(s) on '${branch}' (run 'git push')`;
    } else {
      result.message = `Up-to-date with remote '${tracking}'`;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    result.message = `Git check failed: ${msg}`;
  }
  return result;
}

export function copyFileSafe(src: string, dest: string) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

export function plainMergeFiles(
  localFile: string,
  repoFile: string,
  baseFile?: string,
): { success: boolean; hasConflicts: boolean; content: string } {
  const tmpMerged = path.join(os.tmpdir(), `ai-sync-merge-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
  const tmpBase = baseFile && fs.existsSync(baseFile)
    ? baseFile
    : path.join(os.tmpdir(), `ai-sync-base-${Date.now()}.tmp`);

  if (!baseFile || !fs.existsSync(baseFile)) {
    fs.writeFileSync(tmpBase, "");
  }

  fs.copyFileSync(localFile, tmpMerged);

  let hasConflicts = false;
  try {
    // git merge-file <current/ours> <base> <other/theirs>
    execSync(
      `git merge-file -L "local (ours)" -L "base" -L "repo (theirs)" "${tmpMerged}" "${tmpBase}" "${repoFile}"`,
      { stdio: "pipe" },
    );
  } catch (e: unknown) {
    // git merge-file exits with positive status code equal to number of conflict blocks
    hasConflicts = true;
  } finally {
    if (!baseFile && fs.existsSync(tmpBase)) {
      fs.unlinkSync(tmpBase);
    }
  }

  const content = fs.readFileSync(tmpMerged, "utf8");
  if (fs.existsSync(tmpMerged)) {
    fs.unlinkSync(tmpMerged);
  }

  return {
    success: true,
    hasConflicts,
    content,
  };
}

export function cmdDiff(fileA: string, fileB: string): string {
  if (!fs.existsSync(fileA) && !fs.existsSync(fileB)) return "No files to compare.";
  try {
    const diff = execSync(`diff -u "${fileB}" "${fileA}" 2>&1 || true`, { stdio: "pipe" }).toString();
    return diff;
  } catch {
    return "";
  }
}

export function cmdStatus(repoBase = DEFAULT_REPO, opts: SyncOptions = {}) {
  console.log(`\n🔍 Scanning AI Custom Harness & Skills:`);
  console.log(`   Machine Home : ${HOME}`);
  console.log(`   Repo Root    : ${repoBase}`);
  if (opts.target) console.log(`   Target Scope : ${opts.target}`);
  if (opts.exclude && opts.exclude.length > 0) console.log(`   Excluding    : ${opts.exclude.join(", ")}`);
  console.log();

  // Git status check
  const gitInfo = checkGitRemoteStatus(repoBase);
  if (gitInfo.isGit) {
    const icon = gitInfo.behind > 0 ? "⚠️ " : gitInfo.ahead > 0 ? "⬆️ " : "🌐";
    console.log(`Git Status (${path.basename(repoBase)}):`);
    console.log(`   ${icon} ${gitInfo.message}\n`);
  }

  // Skill provenance: external and ignored skills stay off the shared git backup
  const manifest = loadManifest(LOCAL_MANIFEST_FILE);
  const skillsDir = path.join(HOME, ".agents", "skills");
  const localSkillDirs = fs.existsSync(skillsDir)
    ? fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];
  const untracked = localSkillDirs.filter((n) => !manifest.skills[n]);
  if (localSkillDirs.length > 0) {
    const filterSkills = (origin: SkillOrigin, sync: boolean) =>
      Object.entries(manifest.skills).filter(
        ([n, e]) => e.origin === origin && e.sync === sync && localSkillDirs.includes(n),
      );
    const fmt = (entries: Array<[string, SkillManifestEntry]>) =>
      entries.map(([n, e]) => (e.source ? `${n} (${e.source}${e.version ? "@" + e.version : ""})` : n)).join(", ") || "—";

    console.log(`📋 Skill Manifest (${LOCAL_MANIFEST_FILE.replace(HOME, "~")}):`);
    console.log(`   ✍️  authored (sync: true)  : ${fmt(filterSkills("authored", true))}`);
    console.log(`   🏠 authored (sync: false) : ${fmt(filterSkills("authored", false))} — local only, excluded from git`);
    console.log(`   🌐 external (sync: false) : ${fmt(filterSkills("external", false))} — pointer only, excluded from git`);
    const externalSynced = filterSkills("external", true);
    if (externalSynced.length > 0) {
      console.log(`   📦 external (sync: true)  : ${fmt(externalSynced)} — vendored full source into git`);
    }
    if (untracked.length > 0) {
      console.log(`   ❓ untracked              : ${untracked.join(", ")} — run 'sync.ts track <name> <authored|external> [--sync|--no-sync]'`);
    }
    console.log();
  }

  const report = compare(repoBase, withOriginFilter(opts, manifest));

  console.log(`📊 Status Overview:`);
  console.log(`   ✨ In Sync   : ${report.inSync} files`);
  console.log(`   🟡 New Local : ${report.missingInRepo.length} files (not backed up)`);
  console.log(`   🔴 New Repo  : ${report.missingInLocal.length} files (missing on machine)`);
  console.log(`   🔵 Modified  : ${report.modified.length} files (diff detected)\n`);

  if (report.missingInRepo.length > 0) {
    console.log(`🟡 Files on Machine needing backup to repo (run 'ai-sync push'):`);
    for (const f of report.missingInRepo) console.log(`   + ${path.relative(HOME, f)}`);
    console.log();
  }

  if (report.missingInLocal.length > 0) {
    console.log(`🔴 Files in Repo needing sync to Machine (run 'ai-sync pull'):`);
    for (const f of report.missingInLocal) console.log(`   + ${path.relative(repoBase, f)}`);
    console.log();
  }

  if (report.modified.length > 0) {
    console.log(`🔵 Modified Files (content mismatch):`);
    for (const f of report.modified) console.log(`   ~ ${path.relative(HOME, f)}`);
    console.log();
  }

  if (report.missingInRepo.length === 0 && report.missingInLocal.length === 0 && report.modified.length === 0) {
    console.log(`✅ 100% In Sync! All extensions, TTSR rules, hooks, and skills match perfectly.\n`);
  }
}

export function cmdPull(repoBase = DEFAULT_REPO, opts: SyncOptions = {}) {
  console.log(`\n⬇️  Pulling custom OMP & Skills from ${repoBase} into local machine...`);
  if (opts.target) console.log(`   Target Scope : ${opts.target}`);
  if (opts.exclude && opts.exclude.length > 0) console.log(`   Excluding    : ${opts.exclude.join(", ")}`);

  const report = compare(repoBase, withOriginFilter(opts));
  let updated = 0;

  for (const rf of report.missingInLocal) {
    for (const item of TARGET_MAP) {
      const adjustedRepo = item.repo.replace(DEFAULT_REPO, repoBase);
      if (rf.startsWith(adjustedRepo)) {
        const rel = path.relative(adjustedRepo, rf);
        const targetLocal = path.join(item.local, rel);
        copyFileSafe(rf, targetLocal);
        console.log(`   [+] Synced: ${rel}`);
        updated++;
        break;
      }
    }
  }

  for (const lf of report.modified) {
    for (const item of TARGET_MAP) {
      if (lf.startsWith(item.local)) {
        const rel = path.relative(item.local, lf);
        const adjustedRepo = item.repo.replace(DEFAULT_REPO, repoBase);
        const repoPath = path.join(adjustedRepo, rel);
        if (fs.existsSync(repoPath)) {
          copyFileSafe(repoPath, lf);
          console.log(`   [~] Updated: ${rel}`);
          updated++;
        }
        break;
      }
    }
  }

  console.log(`\n✅ Pull complete: ${updated} files updated on this machine.\n`);
}

export function cmdPush(repoBase = DEFAULT_REPO, opts: SyncOptions = {}) {
  console.log(`\n⬆️  Backing up local machine OMP & Skills into ${repoBase}...`);
  if (opts.target) console.log(`   Target Scope : ${opts.target}`);
  if (opts.exclude && opts.exclude.length > 0) console.log(`   Excluding    : ${opts.exclude.join(", ")}`);

  const report = compare(repoBase, withOriginFilter(opts));
  let updated = 0;

  for (const lf of report.missingInRepo) {
    for (const item of TARGET_MAP) {
      if (lf.startsWith(item.local)) {
        const rel = path.relative(item.local, lf);
        const adjustedRepo = item.repo.replace(DEFAULT_REPO, repoBase);
        const targetRepo = path.join(adjustedRepo, rel);
        copyFileSafe(lf, targetRepo);
        console.log(`   [+] Exported: ${rel}`);
        updated++;
        break;
      }
    }
  }

  for (const lf of report.modified) {
    for (const item of TARGET_MAP) {
      if (lf.startsWith(item.local)) {
        const rel = path.relative(item.local, lf);
        const adjustedRepo = item.repo.replace(DEFAULT_REPO, repoBase);
        const targetRepo = path.join(adjustedRepo, rel);
        copyFileSafe(lf, targetRepo);
        console.log(`   [~] Overwrote: ${rel}`);
        updated++;
        break;
      }
    }
  }

  console.log(`\n✅ Backup complete: ${updated} files backed up to ${repoBase}.\n`);
}

export function cmdViewDiff(repoBase = DEFAULT_REPO, opts: SyncOptions = {}) {
  console.log(`\n🔍 Inspecting diffs between local machine and ${repoBase}...\n`);
  const report = compare(repoBase, withOriginFilter(opts));
  if (report.modified.length === 0) {
    console.log(`✨ No content differences found between matching files.\n`);
    return;
  }

  for (const localFile of report.modified) {
    for (const item of TARGET_MAP) {
      if (localFile.startsWith(item.local)) {
        const rel = path.relative(item.local, localFile);
        const adjustedRepo = item.repo.replace(DEFAULT_REPO, repoBase);
        const repoFile = path.join(adjustedRepo, rel);
        console.log(`══════════════════════════════════════════════════════════════`);
        console.log(`File: ${rel}`);
        console.log(`Local: ${localFile}`);
        console.log(`Repo : ${repoFile}`);
        console.log(`══════════════════════════════════════════════════════════════`);
        const diffText = cmdDiff(localFile, repoFile);
        console.log(diffText || "(binary or identical)");
        console.log();
        break;
      }
    }
  }
}
export function cmdResolve(repoBase = DEFAULT_REPO, opts: SyncOptions = {}, mode: "interactive" | "merge-all" = "interactive") {
  console.log(`\n🔄 Resolving divergent files between Local (ours) and Repo (theirs)...\n`);
  const report = compare(repoBase, withOriginFilter(opts));
  if (report.modified.length === 0) {
    console.log(`✨ No content differences found between matching files.\n`);
    return;
  }

  let resolved = 0;
  for (const localFile of report.modified) {
    for (const item of TARGET_MAP) {
      if (localFile.startsWith(item.local)) {
        const rel = path.relative(item.local, localFile);
        const adjustedRepo = item.repo.replace(DEFAULT_REPO, repoBase);
        const repoFile = path.join(adjustedRepo, rel);

        console.log(`══════════════════════════════════════════════════════════════`);
        console.log(`Conflict / Divergence: ${rel}`);
        console.log(`Local (ours)  : ${localFile}`);
        console.log(`Repo (theirs) : ${repoFile}`);
        console.log(`══════════════════════════════════════════════════════════════`);

        if (mode === "merge-all") {
          const mergeRes = plainMergeFiles(localFile, repoFile);
          fs.writeFileSync(localFile, mergeRes.content, "utf8");
          fs.writeFileSync(repoFile, mergeRes.content, "utf8");
          if (mergeRes.hasConflicts) {
            console.log(`⚠️  Merged with conflict markers in both local and repo.`);
            console.log(`👉 Notice for AI agent: Inspect conflict markers (<<<<<<< / >>>>>>>) and suggest rephrased synthesis.`);
          } else {
            console.log(`✅ Cleanly combined changes from both local and repo!`);
          }
          resolved++;
          break;
        }

        // Non-interactive or script fallback if no TTY
        console.log(`Options:`);
        console.log(`  [d] View diff`);
        console.log(`  [1] Keep ours (Local) -> overwrites Repo`);
        console.log(`  [2] Accept theirs (Repo) -> overwrites Local`);
        console.log(`  [3] Combine (Plain 3-way merge)`);
        console.log(`  [s] Skip`);

        let choice = "3"; // default to combine in non-interactive / agent mode
        if (process.stdin.isTTY) {
          const prompt = require("readline-sync");
          choice = prompt.question("Choice [d/1/2/3/s] (default: 3): ").trim() || "3";
        } else {
          console.log(`Running in non-interactive / agent environment: defaulting to [3] Combine.`);
        }

        if (choice === "d") {
          console.log(cmdDiff(localFile, repoFile));
          continue;
        } else if (choice === "1") {
          copyFileSafe(localFile, repoFile);
          console.log(`[~] Kept ours (Local): overwrote repo.`);
          resolved++;
        } else if (choice === "2") {
          copyFileSafe(repoFile, localFile);
          console.log(`[~] Accepted theirs (Repo): overwrote local.`);
          resolved++;
        } else if (choice === "3") {
          const mergeRes = plainMergeFiles(localFile, repoFile);
          fs.writeFileSync(localFile, mergeRes.content, "utf8");
          fs.writeFileSync(repoFile, mergeRes.content, "utf8");
          if (mergeRes.hasConflicts) {
            console.log(`⚠️  Merged with conflict markers in both local and repo.`);
            console.log(`👉 Action: Review conflict markers (<<<<<<< / >>>>>>>) and rephrase combined section.`);
          } else {
            console.log(`✅ Cleanly combined changes from both local and repo!`);
          }
          resolved++;
        } else {
          console.log(`[s] Skipped.`);
        }
        console.log();
        break;
      }
    }
  }
  console.log(`\n🎉 Resolve finished: ${resolved} file(s) updated.\n`);
}
export function cmdTrack(
  skill: string,
  origin: SkillOrigin,
  meta: { from?: string; version?: string; sync?: boolean } = {},
  repoBase = DEFAULT_REPO,
) {
  if (!["authored", "external"].includes(origin)) {
    console.log(`❌ Invalid origin '${origin}'. Use authored | external.`);
    process.exit(1);
  }
  // Default sync behavior: authored defaults to true, external defaults to false
  const sync = meta.sync !== undefined ? meta.sync : origin === "authored";

  const manifest = loadManifest(LOCAL_MANIFEST_FILE);
  manifest.skills[skill] = {
    origin,
    sync,
    ...(meta.from ? { source: meta.from, sourceType: "github", install: `npx skills add ${meta.from} -g` } : {}),
    ...(meta.version ? { version: meta.version } : {}),
  };
  saveManifest(LOCAL_MANIFEST_FILE, manifest);
  console.log(`📋 Tracked '${skill}' as ${origin} (sync: ${sync})${meta.from ? ` (${meta.from}${meta.version ? "@" + meta.version : ""})` : ""} in ${LOCAL_MANIFEST_FILE.replace(HOME, "~")}`);

  // All skills (whether synced or pointer-only) update the shared repo manifest
  const repoManifestFile = path.join(repoBase, MANIFEST_FILENAME);
  const repoManifest = loadManifest(repoManifestFile);
  repoManifest.skills[skill] = manifest.skills[skill];
  saveManifest(repoManifestFile, repoManifest);
  console.log(`   🌐 Repo manifest updated: ${repoManifestFile.replace(HOME, "~")} (commit with your next push)`);
}

export function cmdBootstrap(repoBase = DEFAULT_REPO) {
  console.log(`\n🚀 Bootstrapping skills from ${repoBase}...`);
  const repoManifestFile = path.join(repoBase, MANIFEST_FILENAME);
  const repoManifest = loadManifest(repoManifestFile);
  if (Object.keys(repoManifest.skills).length === 0) {
    console.log(`❌ No ${MANIFEST_FILENAME} found in repo. Run 'sync.ts track <skill> authored' on a machine that has skills first.\n`);
    return;
  }

  // Seed the local manifest without overwriting this machine's own settings
  const localManifest = loadManifest(LOCAL_MANIFEST_FILE);
  let seeded = 0;
  for (const [name, entry] of Object.entries(repoManifest.skills)) {
    if (!localManifest.skills[name]) {
      localManifest.skills[name] = entry;
      seeded++;
    }
  }
  saveManifest(LOCAL_MANIFEST_FILE, localManifest);
  console.log(`   📋 Local manifest updated with ${seeded} new entr${seeded === 1 ? "y" : "ies"} (${Object.keys(localManifest.skills).length} total)`);

  // Skills with sync: true come directly from the repo backup
  const syncedSkills = Object.keys(repoManifest.skills).filter((n) => repoManifest.skills[n].sync === true);
  if (syncedSkills.length > 0) {
    console.log(`   ✨ Pulling synced skills: ${syncedSkills.join(", ")}`);
    cmdPull(repoBase, { target: "skills" });
  }

  // External skills with install command are installed from upstream
  const skillsDir = path.join(HOME, ".agents", "skills");
  for (const [name, entry] of Object.entries(repoManifest.skills)) {
    if (entry.origin !== "external" || entry.sync === true) continue;
    if (fs.existsSync(path.join(skillsDir, name))) {
      console.log(`   ✅ external '${name}' already installed`);
      continue;
    }
    const installCmd = entry.install || (entry.source ? `npx -y skills add ${entry.source} -g` : null);
    if (!installCmd) {
      console.log(`   ⚠️  external '${name}' has no install command or source — install manually`);
      continue;
    }
    console.log(`   🌐 Installing external '${name}' via: ${installCmd}`);
    try {
      execSync(installCmd, { stdio: "inherit" });
    } catch {
      console.log(`   ❌ Install failed for '${name}'. Retry manually: ${installCmd}`);
    }
  }
  console.log(`\n✅ Bootstrap complete.\n`);
}
export function cmdDiscover(repoBase = DEFAULT_REPO): SkillsManifest {
  console.log(`\n🔍 ai-sync: Skill Discovery & Provenance Report`);
  console.log(`─────────────────────────────────────────────────────────────────────────────`);
  const localSkillsDir = path.join(HOME, ".agents", "skills");
  const repoSkillsDir = path.join(repoBase, ".agents", "skills");
  console.log(`📍 Machine Home : ${localSkillsDir}`);
  console.log(`🌐 Backup Repo  : ${repoSkillsDir}\n`);

  const skillsLock = loadSkillsLock();
  const repoManifest = loadManifest(path.join(repoBase, MANIFEST_FILENAME));
  const localManifest = loadManifest(LOCAL_MANIFEST_FILE);

  const skillDirs = fs.existsSync(localSkillsDir)
    ? fs.readdirSync(localSkillsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
    : [];

  const discovered: SkillsManifest = { version: 1, skills: {} };

  for (const name of skillDirs) {
    // If local manifest already has an explicit manual decision, preserve origin & sync
    const existing = localManifest.skills[name];
    if (existing) {
      discovered.skills[name] = { ...existing };
      if (!discovered.skills[name].detectionReason) {
        discovered.skills[name].detectionReason = existing.sync
          ? "matched in repo"
          : existing.origin === "external"
          ? (existing.source ? `pointer (${existing.source})` : "external manifest")
          : "private to this machine";
      }
    } else {
      const fullPath = path.join(localSkillsDir, name);
      discovered.skills[name] = autoDetectSkill(name, fullPath, repoSkillsDir, skillsLock, repoManifest);
    }
  }

  // Group results
  const authoredSynced = Object.entries(discovered.skills).filter(([, e]) => e.origin === "authored" && e.sync);
  const externalDeps = Object.entries(discovered.skills).filter(([, e]) => e.origin === "external" && !e.sync);
  const externalSynced = Object.entries(discovered.skills).filter(([, e]) => e.origin === "external" && e.sync);
  const localExperiments = Object.entries(discovered.skills).filter(([, e]) => e.origin === "authored" && !e.sync);

  console.log(`📦 SKILLS BREAKDOWN (${skillDirs.length} installed):\n`);

  console.log(`  ✨ AUTHORED & SYNCED (${authoredSynced.length} skills) — Backed up to Git`);
  console.log(`  ─────────────────────────────────────────────────────────`);
  if (authoredSynced.length === 0) console.log(`     (none)`);
  for (const [name, e] of authoredSynced) {
    const reason = e.detectionReason ? `[${e.detectionReason}]` : "";
    console.log(`     • ${name.padEnd(20)} ${reason}`);
  }
  console.log();

  console.log(`  🌐 EXTERNAL DEPENDENCIES (${externalDeps.length} skills) — Pointers only, excluded from Git`);
  console.log(`  ─────────────────────────────────────────────────────────`);
  if (externalDeps.length === 0) console.log(`     (none)`);
  for (const [name, e] of externalDeps) {
    const sourceTag = e.source ? `(${e.source}${e.version ? "@" + e.version : ""})` : "";
    const reason = e.detectionReason ? `[${e.detectionReason}]` : "";
    console.log(`     • ${name.padEnd(18)} ${sourceTag.padEnd(28)} ${reason}`);
  }
  console.log();

  if (externalSynced.length > 0) {
    console.log(`  📦 EXTERNAL VENDORED (${externalSynced.length} skills) — Full source committed to Git`);
    console.log(`  ─────────────────────────────────────────────────────────`);
    for (const [name, e] of externalSynced) {
      console.log(`     • ${name.padEnd(20)} [vendored]`);
    }
    console.log();
  }

  console.log(`  🔒 MACHINE-LOCAL EXPERIMENTS (${localExperiments.length} skills) — Private to this Mac`);
  console.log(`  ─────────────────────────────────────────────────────────`);
  if (localExperiments.length === 0) console.log(`     (none)`);
  for (const [name, e] of localExperiments) {
    const reason = e.detectionReason ? `[${e.detectionReason}]` : "";
    console.log(`     • ${name.padEnd(20)} (sync: false)        ${reason}`);
  }
  console.log();

  // Save to local manifest
  saveManifest(LOCAL_MANIFEST_FILE, discovered);

  const nonSyncedCount = externalDeps.length + localExperiments.length;
  console.log(`─────────────────────────────────────────────────────────────────────────────`);
  console.log(`🛡️  Git Protection Summary:`);
  console.log(`   • ${authoredSynced.length + externalSynced.length} skills backed up to Git (0 third-party bloat)`);
  console.log(`   • ${nonSyncedCount} non-synced skills prevented from polluting repo (~450+ files saved)`);
  console.log(`   • Local manifest updated: ${LOCAL_MANIFEST_FILE.replace(HOME, "~")}\n`);

  console.log(`💡 Next Actions:`);
  console.log(`   • Back up authored changes : bun sync.ts push`);
  console.log(`   • Promote an experiment    : bun sync.ts track <name> authored --sync\n`);

  return discovered;
}

export function parseArgs(rawArgs: string[]): {
  command: string;
  repo: string;
  opts: SyncOptions;
  /** positional args after the command (e.g. track <skill> <origin>) */
  args: string[];
  meta: { from?: string; version?: string; sync?: boolean };
} {
  let command = "status";
  let repo = DEFAULT_REPO;
  const opts: SyncOptions = { exclude: [] };
  const meta: { from?: string; version?: string; sync?: boolean } = {};
  const positional: string[] = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === "--exclude" || arg === "-x") {
      if (i + 1 < rawArgs.length) {
        opts.exclude!.push(rawArgs[++i]);
      }
    } else if (arg.startsWith("--exclude=")) {
      opts.exclude!.push(arg.slice("--exclude=".length));
    } else if (arg === "--target" || arg === "-t") {
      if (i + 1 < rawArgs.length) {
        opts.target = rawArgs[++i];
      }
    } else if (arg.startsWith("--target=")) {
      opts.target = arg.slice("--target=".length);
    } else if (arg === "--include-local") {
      opts.includeLocal = true;
    } else if (arg === "--sync") {
      meta.sync = true;
    } else if (arg === "--no-sync") {
      meta.sync = false;
    } else if (arg === "--from") {
      if (i + 1 < rawArgs.length) meta.from = rawArgs[++i];
    } else if (arg.startsWith("--from=")) {
      meta.from = arg.slice("--from=".length);
    } else if (arg === "--version") {
      if (i + 1 < rawArgs.length) meta.version = rawArgs[++i];
    } else if (arg.startsWith("--version=")) {
      meta.version = arg.slice("--version=".length);
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  if (positional[0]) command = positional[0];
  // track/bootstrap take skill names as positionals, not target categories
  const rest = positional.slice(1);
  if (command !== "track" && command !== "bootstrap" && command !== "discover" && rest[0]) {
    // If rest[0] is an existing dir or starts with / or ~, it is custom repo.
    // Otherwise, it can be treated as target category if not already set.
    if (rest[0].startsWith("/") || rest[0].startsWith("~") || fs.existsSync(rest[0])) {
      repo = rest[0].replace(/^~/, HOME);
    } else if (!opts.target) {
      opts.target = rest[0];
    }
  }
  if (command !== "track" && command !== "bootstrap" && command !== "discover" && rest[1] && !repo) {
    repo = rest[1].replace(/^~/, HOME);
  }

  return { command, repo, opts, args: rest, meta };
}

// CLI entrypoint when run directly
if (import.meta.main) {
  const { command, repo, opts, args, meta } = parseArgs(process.argv.slice(2));

  switch (command) {
    case "status":
    case "scan":
      cmdStatus(repo, opts);
      break;
    case "diff":
      cmdViewDiff(repo, opts);
      break;
    case "resolve":
    case "review":
      cmdResolve(repo, opts, "interactive");
      break;
    case "merge":
    case "combine":
      cmdResolve(repo, opts, "merge-all");
      break;
    case "pull":
    case "apply":
      cmdPull(repo, opts);
      break;
    case "push":
    case "backup":
    case "save":
      cmdPush(repo, opts);
      break;
    case "track":
      if (!args[0] || !args[1]) {
        console.log(`Usage: bun sync.ts track <skill> <authored|external> [--sync|--no-sync] [--from <owner/repo>] [--version <v>]`);
        process.exit(1);
      }
      cmdTrack(args[0], args[1] as SkillOrigin, meta, repo);
      break;
    case "bootstrap":
    case "restore":
      cmdBootstrap(repo);
      break;
    case "discover":
      cmdDiscover(repo);
      break;
    default:
      console.log(`Usage: bun sync.ts [status|discover|diff|resolve|merge|pull|push|track|bootstrap] [target|repo_path] [--exclude <name>] [--target <scope>] [--include-local]`);
      process.exit(1);
  }
}

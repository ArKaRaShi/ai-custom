#!/usr/bin/env bun
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createHash } from "crypto";
import { execSync } from "child_process";
import type { SkillManifestEntry } from "./manifest";
import { DEFAULT_REPO, HOME, TARGET_MAP, SyncOptions, matchesPattern } from "./targets";
import { LOCAL_MANIFEST_FILE, loadManifest, withOriginFilter, SkillOrigin } from "./manifest";
import { checkGitRemoteStatus } from "./git";
import { printSyncSummary } from "./reporting";

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
  printSyncSummary(manifest);
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
  printSyncSummary(loadManifest(LOCAL_MANIFEST_FILE));
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
  printSyncSummary(loadManifest(LOCAL_MANIFEST_FILE));
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

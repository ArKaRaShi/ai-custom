#!/usr/bin/env bun
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createHash } from "crypto";
import { execSync } from "child_process";
import { DEFAULT_REPO, HOME, SyncOptions, matchesPattern } from "./targets";
import {
  loadLocations,
  loadUnifiedManifest,
  pathRuleMatches,
  resolveRootPaths,
  type ResolvedRoot,
  type SyncEntry,
} from "./unified-manifest";

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

// Paths ignored by the repo's own .gitignore are intentionally excluded (e.g.
// `vale sync`-downloaded packages) — reuse git itself rather than reimplementing
// gitignore glob semantics.
export function getGitIgnoredSet(repoBase: string, relPaths: string[]): Set<string> {
  const ignored = new Set<string>();
  if (relPaths.length === 0 || !fs.existsSync(path.join(repoBase, ".git"))) return ignored;
  try {
    const out = execSync("git check-ignore --stdin", {
      cwd: repoBase,
      input: relPaths.join("\n"),
      stdio: ["pipe", "pipe", "ignore"],
    }).toString();
    for (const line of out.split("\n")) {
      if (line) ignored.add(line);
    }
  } catch (err: any) {
    // check-ignore exits 1 when nothing matches; only surface real failures.
    if (err?.stdout) {
      for (const line of err.stdout.toString().split("\n")) {
        if (line) ignored.add(line);
      }
    }
  }
  return ignored;
}
interface ResolvedSyncTarget {
  local: string;
  repo: string;
  name: string;
  category: string;
  rootId: string;
  entries: SyncEntry[];
}

function getSyncTargets(repoBase: string): ResolvedSyncTarget[] {
  const manifest = loadUnifiedManifest(repoBase);
  const roots: ResolvedRoot[] = resolveRootPaths(manifest, loadLocations(), repoBase);
  const targets: ResolvedSyncTarget[] = [];
  for (const root of roots) {
    const entries = manifest.entries.filter((entry) => entry.root === root.id);
    if (root.kind === "path") {
      targets.push({ ...root, name: root.id, category: root.id, rootId: root.id, entries });
    } else {
      for (const entry of entries) {
        if (entry.kind === "skill" && entry.sync) {
          targets.push({
            local: path.join(root.local, entry.path), repo: path.join(root.repo, entry.path),
            name: entry.path, category: "skills", rootId: root.id, entries: [entry],
          });
        }
      }
    }
  }
  return targets;
}


function targetForPath(targets: ResolvedSyncTarget[], value: string, side: "local" | "repo"): { target: ResolvedSyncTarget; relative: string } | undefined {
  for (const target of targets) {
    const base = target[side];
    const relative = path.relative(base, value);
    if (relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) return { target, relative };
  }
  return undefined;
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

  const targets = getSyncTargets(repoBase).filter((item) =>
    !opts.target || item.category.toLowerCase().includes(opts.target.toLowerCase()) ||
    item.name.toLowerCase().includes(opts.target.toLowerCase()),
  );

  for (const item of targets) {
    const adjustedRepo = item.repo;
    const policyAllows = (relativePath: string): boolean => {
      if (item.category === "skills") return true;
      let allowed = false;
      for (const entry of item.entries) {
        if (entry.kind === "path" && pathRuleMatches(entry, relativePath)) allowed = entry.sync;
      }
      return allowed;
    };

    if (fs.existsSync(item.local) && fs.statSync(item.local).isFile()) {
      const rel = path.basename(item.local);
      if (!policyAllows(rel) || opts.exclude && matchesPattern(rel, opts.exclude)) continue;

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
      if (!policyAllows(rel)) continue;
      if (opts.exclude && matchesPattern(rel, opts.exclude)) continue;
      localRelMap.set(rel, lf);
    }

    const repoRelMap = new Map<string, string>();
    for (const rf of repoFiles) {
      const rel = path.relative(adjustedRepo, rf);
      if (!policyAllows(rel)) continue;
      if (opts.exclude && matchesPattern(rel, opts.exclude)) continue;
      repoRelMap.set(rel, rf);
    }

    // Files only on the machine that the repo's own .gitignore excludes
    // (e.g. `vale sync`-downloaded packages) are intentional, not drift.
    const candidateRels = [...localRelMap.keys()].filter((rel) => !repoRelMap.has(rel));
    const candidateRepoRels = candidateRels.map((rel) =>
      path.relative(repoBase, path.join(adjustedRepo, rel))
    );
    const ignoredSet = getGitIgnoredSet(repoBase, candidateRepoRels);

    // Check local files against repo
    for (const [rel, localPath] of localRelMap) {
      const repoPath = repoRelMap.get(rel);
      if (!repoPath) {
        const repoRel = path.relative(repoBase, path.join(adjustedRepo, rel));
        if (!ignoredSet.has(repoRel)) report.missingInRepo.push(localPath);
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

export function cmdStatus(repoBase = DEFAULT_REPO, opts: SyncOptions = {}): void {
  console.log(`\n🔍 ai-sync status`);
  console.log(`   Machine Home : ${HOME}`);
  console.log(`   Repo Root    : ${repoBase}`);
  if (opts.target) console.log(`   Target Scope : ${opts.target}`);

  const manifest = loadUnifiedManifest(repoBase);
  const locations = loadLocations();
  const missing = Object.keys(manifest.roots).filter((id) => !locations.roots[id]);
  for (const [id, root] of Object.entries(manifest.roots)) {
    console.log(`   ${id} (${root.kind}): ${root.repoRoot}${locations.roots[id] ? ` -> ${locations.roots[id]}` : " -> UNBOUND"}`);
  }
  for (const entry of manifest.entries) {
    console.log(`   ${entry.sync ? "sync" : "local"} ${entry.root}:${entry.path}`);
  }
  if (missing.length) {
    console.log(`Missing local bindings: ${missing.join(", ")}. Run 'root bind' for each root.`);
    return;
  }

  const report = compare(repoBase, opts);
  console.log(`\n📊 Status Overview:`);
  console.log(`   In Sync   : ${report.inSync} files`);
  console.log(`   New Local : ${report.missingInRepo.length} files`);
  console.log(`   New Repo  : ${report.missingInLocal.length} files`);
  console.log(`   Modified  : ${report.modified.length} files`);
}

export function cmdPull(repoBase = DEFAULT_REPO, opts: SyncOptions = {}): void {
  console.log(`\n⬇️  Pulling files from ${repoBase} into local roots...`);
  const report = compare(repoBase, opts);
  const targets = getSyncTargets(repoBase);
  let updated = 0;
  for (const rf of [...report.missingInLocal, ...report.modified.map((local) => {
    const pair = targetForPath(targets, local, "local");
    return pair ? path.join(pair.target.repo, pair.relative) : "";
  }).filter(Boolean)]) {
    const pair = targetForPath(targets, rf, "repo");
    if (!pair) continue;
    const destination = path.join(pair.target.local, pair.relative);
    copyFileSafe(rf, destination);
    console.log(`   [+] Synced: ${pair.relative}`);
    updated++;
  }
  console.log(`\n✅ Pull complete: ${updated} files updated on this machine.\n`);
}

export function cmdPush(repoBase = DEFAULT_REPO, opts: SyncOptions = {}): void {
  console.log(`\n⬆️  Backing up local roots into ${repoBase}...`);
  const report = compare(repoBase, opts);
  const targets = getSyncTargets(repoBase);
  let updated = 0;
  for (const lf of [...report.missingInRepo, ...report.modified]) {
    const pair = targetForPath(targets, lf, "local");
    if (!pair) continue;
    const destination = path.join(pair.target.repo, pair.relative);
    copyFileSafe(lf, destination);
    console.log(`   [+] Exported: ${pair.relative}`);
    updated++;
  }
  console.log(`\n✅ Backup complete: ${updated} files backed up to ${repoBase}.\n`);
}


export function cmdViewDiff(repoBase = DEFAULT_REPO, opts: SyncOptions = {}): void {
  console.log(`\n🔍 Inspecting diffs between local machine and ${repoBase}...\n`);
  const report = compare(repoBase, opts);
  const targets = getSyncTargets(repoBase);
  if (report.modified.length === 0) {
    console.log(`✨ No content differences found between matching files.\n`);
    return;
  }
  for (const localFile of report.modified) {
    const pair = targetForPath(targets, localFile, "local");
    if (!pair) continue;
    const repoFile = path.join(pair.target.repo, pair.relative);
    console.log(`══════════════════════════════════════════════════════════════`);
    console.log(`File: ${pair.relative}`);
    console.log(`Local: ${localFile}`);
    console.log(`Repo : ${repoFile}`);
    console.log(`══════════════════════════════════════════════════════════════`);
    console.log(cmdDiff(localFile, repoFile) || "(binary or identical)");
    console.log();
  }
}

export function cmdResolve(repoBase = DEFAULT_REPO, opts: SyncOptions = {}, mode: "interactive" | "merge-all" = "interactive"): void {
  console.log(`\n🔄 Resolving divergent files between Local (ours) and Repo (theirs)...\n`);
  const report = compare(repoBase, opts);
  const targets = getSyncTargets(repoBase);
  if (report.modified.length === 0) {
    console.log(`✨ No content differences found between matching files.\n`);
    return;
  }
  let resolved = 0;
  for (const localFile of report.modified) {
    const pair = targetForPath(targets, localFile, "local");
    if (!pair) continue;
    const repoFile = path.join(pair.target.repo, pair.relative);
    console.log(`Conflict / Divergence: ${pair.relative}`);
    if (mode === "merge-all") {
      const mergeRes = plainMergeFiles(localFile, repoFile);
      fs.writeFileSync(localFile, mergeRes.content, "utf8");
      fs.writeFileSync(repoFile, mergeRes.content, "utf8");
      console.log(mergeRes.hasConflicts ? "Merged with conflict markers; review before keeping." : "Cleanly combined changes from both copies.");
      resolved++;
      continue;
    }
    let choice = "3";
    if (process.stdin.isTTY) {
      const prompt = require("readline-sync");
      choice = prompt.question("Choice [d/1/2/3/s] (default: 3): ").trim() || "3";
    }
    if (choice === "d") console.log(cmdDiff(localFile, repoFile));
    else if (choice === "1") { copyFileSafe(localFile, repoFile); resolved++; }
    else if (choice === "2") { copyFileSafe(repoFile, localFile); resolved++; }
    else if (choice === "3") {
      const mergeRes = plainMergeFiles(localFile, repoFile);
      fs.writeFileSync(localFile, mergeRes.content, "utf8");
      fs.writeFileSync(repoFile, mergeRes.content, "utf8");
      resolved++;
    }
  }
  console.log(`\n🎉 Resolve finished: ${resolved} file(s) updated.\n`);
}

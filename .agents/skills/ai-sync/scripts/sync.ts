#!/usr/bin/env bun
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createHash } from "crypto";

const HOME = os.homedir();
const DEFAULT_REPO = path.join(HOME, "Disk", "ai-custom");

const TARGET_MAP: Array<{ local: string; repo: string; name: string }> = [
  {
    name: "OMP Config",
    local: path.join(HOME, ".omp", "agent", "config.yml"),
    repo: path.join(DEFAULT_REPO, ".omp", "config.yml"),
  },
  {
    name: "OMP Extensions",
    local: path.join(HOME, ".omp", "agent", "extensions"),
    repo: path.join(DEFAULT_REPO, ".omp", "extensions"),
  },
  {
    name: "OMP Rules",
    local: path.join(HOME, ".omp", "agent", "rules"),
    repo: path.join(DEFAULT_REPO, ".omp", "rules"),
  },
  {
    name: "OMP Hooks",
    local: path.join(HOME, ".omp", "agent", "hooks"),
    repo: path.join(DEFAULT_REPO, ".omp", "hooks"),
  },
  {
    name: "OMP Tests",
    local: path.join(HOME, ".omp", "agent", "tests"),
    repo: path.join(DEFAULT_REPO, ".omp", "tests"),
  },
  {
    name: "User Skills",
    local: path.join(HOME, ".agents", "skills"),
    repo: path.join(DEFAULT_REPO, ".agents", "skills"),
  },
];

function sha256(filePath: string): string {
  try {
    const buf = fs.readFileSync(filePath);
    return createHash("sha256").update(buf).digest("hex");
  } catch {
    return "";
  }
}

function getAllFiles(dir: string): string[] {
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

interface DiffReport {
  missingInRepo: string[];   // Present in local machine, missing in repo
  missingInLocal: string[];  // Present in repo, missing in local machine
  modified: string[];        // Exists in both but content differs
  inSync: number;
}

function compare(repoBase = DEFAULT_REPO): DiffReport {
  const report: DiffReport = {
    missingInRepo: [],
    missingInLocal: [],
    modified: [],
    inSync: 0,
  };

  for (const item of TARGET_MAP) {
    const adjustedRepo = item.repo.replace(DEFAULT_REPO, repoBase);

    // Single file comparison (like config.yml)
    if (fs.existsSync(item.local) && fs.statSync(item.local).isFile()) {
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
      localRelMap.set(path.relative(item.local, lf), lf);
    }

    const repoRelMap = new Map<string, string>();
    for (const rf of repoFiles) {
      repoRelMap.set(path.relative(adjustedRepo, rf), rf);
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

function copyFileSafe(src: string, dest: string) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

export function cmdStatus(repoBase = DEFAULT_REPO) {
  console.log(`\n🔍 Scanning AI Custom Harness & Skills:`);
  console.log(`   Machine Home : ${HOME}`);
  console.log(`   Repo Root    : ${repoBase}\n`);

  const report = compare(repoBase);

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

export function cmdPull(repoBase = DEFAULT_REPO) {
  console.log(`\n⬇️  Pulling custom OMP & Skills from ${repoBase} into local machine...`);
  const report = compare(repoBase);

  let updated = 0;
  // Copy missing files from repo to local
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

  // Copy modified files from repo to local
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

export function cmdPush(repoBase = DEFAULT_REPO) {
  console.log(`\n⬆️  Backing up local machine OMP & Skills into ${repoBase}...`);
  const report = compare(repoBase);

  let updated = 0;
  // Copy missing files from local to repo
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

  // Copy modified files from local to repo
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

// CLI entrypoint
const args = process.argv.slice(2);
const command = args[0] || "status";
const customRepo = args[1] || DEFAULT_REPO;

switch (command) {
  case "status":
  case "scan":
  case "diff":
    cmdStatus(customRepo);
    break;
  case "pull":
  case "apply":
    cmdPull(customRepo);
    break;
  case "push":
  case "backup":
  case "save":
    cmdPush(customRepo);
    break;
  default:
    console.log(`Usage: bun sync.ts [status|pull|push] [optional_repo_path]`);
    process.exit(1);
}

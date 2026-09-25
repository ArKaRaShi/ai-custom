#!/usr/bin/env bun
/**
 * Isolated sibling Git worktree management with safe preview teardown and Approach 3 logging.
 */

import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

type Flags = Record<string, string>;

interface WorktreeInfo {
  path: string;
  head: string;
  branch?: string;
  isBare: boolean;
}

function parseArgs(argv: string[]): { positional: string[]; flags: Flags } {
  const positional: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h") {
      flags.h = "true";
    } else if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          flags[arg.slice(2)] = next;
          i++;
        } else {
          flags[arg.slice(2)] = "true";
        }
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function printHelp(): void {
  console.log(`Usage:
  worktree.ts list [--format=json]
  worktree.ts create <slug> [--base <ref>] [--branch <name>] [--format=json]
  worktree.ts remove <slug-or-path> [--apply] [--force] [--format=json]

Safety rules:
  - Worktrees are always created as sibling directories (never nested).
  - remove defaults to non-destructive preview; pass --apply to execute.
  - Branches are never deleted automatically during teardown.`);
}

function runGit(args: string[], cwd = process.cwd()): { stdout: string; stderr: string; exitCode: number } {
  const proc = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdout: proc.stdout.toString().trim(),
    stderr: proc.stderr.toString().trim(),
    exitCode: proc.exitCode ?? 1,
  };
}

export function listWorktrees(cwd = process.cwd()): WorktreeInfo[] {
  const res = runGit(["worktree", "list", "--porcelain"], cwd);
  if (res.exitCode !== 0) {
    throw new Error(res.stderr || "Failed to list git worktrees");
  }
  const lines = res.stdout.split("\n");
  const worktrees: WorktreeInfo[] = [];
  let current: Partial<WorktreeInfo> = {};

  for (const line of lines) {
    if (line.startsWith("worktree ")) {
      if (current.path) worktrees.push(current as WorktreeInfo);
      current = { path: line.slice(9).trim(), isBare: false };
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice(5).trim();
    } else if (line.startsWith("branch ")) {
      const fullRef = line.slice(7).trim();
      current.branch = fullRef.replace(/^refs\/heads\//, "");
    } else if (line === "bare") {
      current.isBare = true;
    }
  }
  if (current.path) worktrees.push(current as WorktreeInfo);
  return worktrees;
}

export function computeSiblingPath(repoRoot: string, slug: string): string {
  const parentDir = dirname(repoRoot);
  const repoName = basename(repoRoot);
  const sanitizedSlug = slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return resolve(parentDir, `${repoName}-${sanitizedSlug}`);
}

async function cmdList(flags: Flags): Promise<void> {
  const worktrees = listWorktrees();
  if (flags.format === "json") {
    console.log(JSON.stringify({
      tool: "isolated-worktree",
      command: "list",
      status: "success",
      fingerprint: {
        project: process.cwd(),
        count: worktrees.length,
      },
      worktrees,
    }, null, 2));
    return;
  }

  console.log(`isolated-worktree:list [${worktrees.length} worktree${worktrees.length === 1 ? "" : "s"}]`);
  console.log(`  (repository: ${process.cwd()})`);
  if (worktrees.length === 0) {
    console.log("  └─ (no active worktrees)");
    return;
  }
  for (let i = 0; i < worktrees.length; i++) {
    const isLast = i === worktrees.length - 1;
    const branchChar = isLast ? "└─" : "├─";
    const wt = worktrees[i];
    const branchLabel = wt.branch ? `[${wt.branch}]` : wt.isBare ? "[bare]" : "[detached]";
    console.log(`  ${branchChar} ${basename(wt.path)} ${branchLabel} -> ${wt.path}`);
  }
}

async function cmdCreate(slug: string, flags: Flags): Promise<void> {
  const rootRes = runGit(["rev-parse", "--show-toplevel"]);
  if (rootRes.exitCode !== 0) {
    throw new Error("Must be run inside a git repository");
  }
  const repoRoot = rootRes.stdout;
  const currentBranchRes = runGit(["branch", "--show-current"]);
  const parentBranch = currentBranchRes.stdout || "HEAD";

  const targetPath = computeSiblingPath(repoRoot, slug);
  if (existsSync(targetPath)) {
    throw new Error(`Target path already exists: ${targetPath}`);
  }

  const branch = flags.branch ?? slug;
  const baseRef = flags.base ?? "HEAD";

  const addRes = runGit(["worktree", "add", "-b", branch, targetPath, baseRef]);
  if (addRes.exitCode !== 0) {
    throw new Error(`git worktree add failed: ${addRes.stderr}`);
  }

  if (flags.format === "json") {
    console.log(JSON.stringify({
      tool: "isolated-worktree",
      command: "create",
      status: "created",
      fingerprint: {
        project: repoRoot,
        parentBranch,
        baseRef,
        branch,
        path: targetPath,
      },
    }, null, 2));
  } else {
    console.log("isolated-worktree:create [sibling]");
    console.log(`  ├─ project   ${repoRoot}`);
    console.log(`  ├─ base_ref  ${baseRef} (parent branch: ${parentBranch})`);
    console.log(`  ├─ branch    ${branch}`);
    console.log(`  ├─ worktree  ${targetPath}`);
    console.log("  └─ status    ✔ created (ready for isolated development)");
  }
}

async function cmdRemove(slugOrPath: string, flags: Flags): Promise<void> {
  const worktrees = listWorktrees();
  const matched = worktrees.find((w) => w.path === slugOrPath || basename(w.path) === slugOrPath || w.path.endsWith(`-${slugOrPath}`));

  if (!matched) {
    throw new Error(`No matching worktree found for '${slugOrPath}'`);
  }

  const rootRes = runGit(["rev-parse", "--show-toplevel"]);
  if (rootRes.exitCode === 0 && rootRes.stdout === matched.path) {
    throw new Error("Cannot remove the primary worktree / current checkout");
  }

  const statusRes = runGit(["status", "--porcelain"], matched.path);
  const isDirty = statusRes.stdout.length > 0;
  const apply = flags.apply === "true";

  if (flags.format === "json") {
    console.log(JSON.stringify({
      tool: "isolated-worktree",
      command: "remove",
      mode: apply ? "apply" : "preview",
      status: apply ? "removed" : "preview",
      fingerprint: {
        worktree: matched.path,
        branch: matched.branch ?? "detached",
        dirty: isDirty,
      },
    }, null, 2));
    if (apply) {
      const removeArgs = ["worktree", "remove", matched.path];
      if (flags.force === "true") removeArgs.push("--force");
      const rmRes = runGit(removeArgs);
      if (rmRes.exitCode !== 0) throw new Error(`git worktree remove failed: ${rmRes.stderr}`);
    }
    return;
  }

  if (!apply) {
    console.log("isolated-worktree:remove [preview]");
    console.log(`  ├─ worktree  ${matched.path}`);
    console.log(`  ├─ branch    ${matched.branch ?? "detached"} (branch will be preserved)`);
    console.log(`  ├─ state     ${isDirty ? "⚠ uncommitted changes present" : "✔ clean"}`);
    console.log("  └─ action    none (preview only; run with --apply to remove)");
  } else {
    console.log("isolated-worktree:remove [apply]");
    const removeArgs = ["worktree", "remove", matched.path];
    if (flags.force === "true") removeArgs.push("--force");
    const rmRes = runGit(removeArgs);
    if (rmRes.exitCode !== 0) {
      throw new Error(`git worktree remove failed: ${rmRes.stderr}`);
    }
    console.log(`  ├─ worktree  ${matched.path}`);
    console.log(`  ├─ branch    ${matched.branch ?? "detached"} (preserved in git)`);
    console.log("  └─ status    ✔ worktree removed");
  }
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help === "true" || flags.h === "true") {
    printHelp();
    return;
  }

  const command = positional[0] ?? "list";

  if (command === "list") {
    await cmdList(flags);
  } else if (command === "create") {
    const slug = positional[1];
    if (!slug) throw new Error("create requires a slug identifier (e.g. worktree.ts create feat-auth)");
    await cmdCreate(slug, flags);
  } else if (command === "remove") {
    const slugOrPath = positional[1];
    if (!slugOrPath) throw new Error("remove requires a slug or path (e.g. worktree.ts remove feat-auth)");
    await cmdRemove(slugOrPath, flags);
  } else {
    throw new Error(`Unknown command '${command}'. Expected list|create|remove`);
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

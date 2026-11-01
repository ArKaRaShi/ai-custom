import { afterAll, afterEach, beforeAll } from "bun:test";
import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const tempDirs: string[] = [];

export function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-git-test-"));
  tempDirs.push(dir);
  return dir;
}

export function initGitRepo(dir: string, isBare = false): void {
  if (isBare) {
    execSync("git init --bare -b main", { cwd: dir, stdio: "ignore" });
  } else {
    execSync("git init -b main", { cwd: dir, stdio: "ignore" });
    execSync("git config user.name 'Test User'", { cwd: dir, stdio: "ignore" });
    execSync("git config user.email 'test@example.com'", { cwd: dir, stdio: "ignore" });
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function commitFile(
  repo: string,
  name: string,
  content: string,
  message = `update ${name}`,
): string {
  fs.mkdirSync(path.dirname(path.join(repo, name)), { recursive: true });
  fs.writeFileSync(path.join(repo, name), content);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", message);
  return git(repo, "rev-parse", "HEAD");
}

/** Hashes every file (and symlink target) below `dir`, including `.git`, so any byte change is visible. */
export function snapshotTree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const rel = path.relative(dir, full);
      if (entry.isSymbolicLink()) out[rel] = `link:${fs.readlinkSync(full)}`;
      else if (entry.isDirectory()) {
        out[`${rel}/`] = "dir";
        walk(full);
      } else out[rel] = createHash("sha256").update(fs.readFileSync(full)).digest("hex");
    }
  };
  walk(dir);
  return out;
}

export interface Scenario {
  remote: string;
  author: string;
  local: string;
}

/** `remote` (bare) <- `author` pushes initial commit; `local` clones it. */
export function makeScenario(remoteName = "remote.git"): Scenario {
  const base = tempDir();
  const remote = path.join(base, remoteName);
  fs.mkdirSync(remote);
  initGitRepo(remote, true);
  const author = path.join(base, "author");
  git(base, "clone", "-q", remote, author);
  commitFile(author, "a.txt", "a1\n");
  commitFile(author, "b.txt", "b1\n");
  commitFile(author, "dir/c.txt", "c1\n");
  git(author, "push", "-q", "origin", "main");
  const local = path.join(base, "local");
  git(base, "clone", "-q", remote, local);
  return { remote, author, local };
}

export function pushAuthor(s: Scenario): string {
  git(s.author, "push", "-q", "origin", "main");
  return git(s.author, "rev-parse", "HEAD");
}

export const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

const savedEnv: Record<string, string | undefined> = {};
let isolatedHome = "";

export function useIsolatedGitEnv(): void {
  beforeAll(() => {
    isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-git-home-"));
    fs.writeFileSync(
      path.join(isolatedHome, ".gitconfig"),
      "[user]\n\tname = Test User\n\temail = test@example.com\n[init]\n\tdefaultBranch = main\n",
    );
    for (const key of ["HOME", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "GIT_TERMINAL_PROMPT"])
      savedEnv[key] = process.env[key];
    process.env.HOME = isolatedHome;
    process.env.GIT_CONFIG_GLOBAL = path.join(isolatedHome, ".gitconfig");
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    process.env.GIT_TERMINAL_PROMPT = "0";
  });
  afterAll(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(isolatedHome, { recursive: true, force: true });
  });
}

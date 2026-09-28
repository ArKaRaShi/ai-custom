import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";
import { gitPull, gitCommitAndPush } from "@/scripts/git";
import { cmdPull, cmdPush } from "@/scripts/sync-files";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-sync-git-test-"));
  tempDirs.push(dir);
  return dir;
}

function initGitRepo(dir: string, isBare = false): void {
  if (isBare) {
    execSync("git init --bare", { cwd: dir, stdio: "ignore" });
  } else {
    execSync("git init -b main", { cwd: dir, stdio: "ignore" });
    execSync("git config user.name 'Test User'", { cwd: dir, stdio: "ignore" });
    execSync("git config user.email 'test@example.com'", { cwd: dir, stdio: "ignore" });
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("given ai-sync git remote integration, when syncing with git-enabled backup", () => {
  it("gitPull pulls latest commits from remote upstream", () => {
    const remote = tempDir();
    initGitRepo(remote, true);

    const clone1 = tempDir();
    execSync(`git clone "${remote}" "${clone1}"`, { stdio: "ignore" });
    execSync("git config user.name 'User 1'", { cwd: clone1, stdio: "ignore" });
    execSync("git config user.email 'u1@example.com'", { cwd: clone1, stdio: "ignore" });
    fs.writeFileSync(path.join(clone1, "upstream.txt"), "hello from remote");
    execSync("git add . && git commit -m 'initial upstream'", { cwd: clone1, stdio: "ignore" });
    execSync("git push origin main", { cwd: clone1, stdio: "ignore" });

    const clone2 = tempDir();
    execSync(`git clone "${remote}" "${clone2}"`, { stdio: "ignore" });
    expect(fs.existsSync(path.join(clone2, "upstream.txt"))).toBe(true);

    // Another commit in clone1 pushed to remote
    fs.writeFileSync(path.join(clone1, "update.txt"), "new file");
    execSync("git add . && git commit -m 'new file'", { cwd: clone1, stdio: "ignore" });
    execSync("git push origin main", { cwd: clone1, stdio: "ignore" });

    // clone2 runs gitPull helper
    const pullResult = gitPull(clone2);
    expect(pullResult.success).toBe(true);
    expect(fs.existsSync(path.join(clone2, "update.txt"))).toBe(true);
  });

  it("gitCommitAndPush stages, commits, and pushes modified files to remote", () => {
    const remote = tempDir();
    initGitRepo(remote, true);

    const clone = tempDir();
    execSync(`git clone "${remote}" "${clone}"`, { stdio: "ignore" });
    execSync("git config user.name 'Backup User'", { cwd: clone, stdio: "ignore" });
    execSync("git config user.email 'backup@example.com'", { cwd: clone, stdio: "ignore" });

    fs.writeFileSync(path.join(clone, "exported-skill.md"), "# Exported Skill");
    const pushResult = gitCommitAndPush(clone, "sync: export skills");
    expect(pushResult.success).toBe(true);

    // Verify remote has the commit
    const verifyClone = tempDir();
    execSync(`git clone "${remote}" "${verifyClone}"`, { stdio: "ignore" });
    expect(fs.existsSync(path.join(verifyClone, "exported-skill.md"))).toBe(true);
  });

  it("CLI push --apply --git-push exports files and pushes to remote git", () => {
    const remote = tempDir();
    initGitRepo(remote, true);

    const repoDir = tempDir();
    execSync(`git clone "${remote}" "${repoDir}"`, { stdio: "ignore" });
    execSync("git config user.name 'Backup User'", { cwd: repoDir, stdio: "ignore" });
    execSync("git config user.email 'backup@example.com'", { cwd: repoDir, stdio: "ignore" });

    const homeDir = tempDir();
    const cli = path.join(import.meta.dir, "../scripts/sync.ts");

    const env = { ...process.env, HOME: homeDir, AI_CUSTOM_REPO: repoDir };

    // Setup manifest and root
    Bun.spawnSync(["bun", cli, "init", repoDir], { env });
    Bun.spawnSync(["bun", cli, "root", "add", "omp", "--kind", "path", "--repo-root", ".omp"], { env });
    const localOmp = path.join(homeDir, "omp");
    fs.mkdirSync(localOmp, { recursive: true });
    Bun.spawnSync(["bun", cli, "root", "bind", "omp", "--local-root", localOmp], { env });
    Bun.spawnSync(["bun", cli, "track", "path", "test.txt", "--root", "omp"], { env });

    fs.writeFileSync(path.join(localOmp, "test.txt"), "hello git push");

    const pushProc = Bun.spawnSync(
      ["bun", cli, "push", "--apply", "--git-push", "-m", "sync: automated push test"],
      { env }
    );
    expect(pushProc.exitCode).toBe(0);

    // Verify remote received the push
    const verifyClone = tempDir();
    execSync(`git clone "${remote}" "${verifyClone}"`, { stdio: "ignore" });
    expect(fs.existsSync(path.join(verifyClone, ".omp", "test.txt"))).toBe(true);
    expect(fs.readFileSync(path.join(verifyClone, ".omp", "test.txt"), "utf8")).toBe("hello git push");
  });

  it("CLI pull --apply --git-pull pulls from remote git and restores local file", () => {
    const remote = tempDir();
    initGitRepo(remote, true);

    const repoDir = tempDir();
    execSync(`git clone "${remote}" "${repoDir}"`, { stdio: "ignore" });
    execSync("git config user.name 'Backup User'", { cwd: repoDir, stdio: "ignore" });
    execSync("git config user.email 'backup@example.com'", { cwd: repoDir, stdio: "ignore" });

    const homeDir = tempDir();
    const cli = path.join(import.meta.dir, "../scripts/sync.ts");
    const env = { ...process.env, HOME: homeDir, AI_CUSTOM_REPO: repoDir };

    // Init repo manifest and root
    Bun.spawnSync(["bun", cli, "init", repoDir], { env });
    Bun.spawnSync(["bun", cli, "root", "add", "omp", "--kind", "path", "--repo-root", ".omp"], { env });
    const localOmp = path.join(homeDir, "omp");
    fs.mkdirSync(localOmp, { recursive: true });
    Bun.spawnSync(["bun", cli, "root", "bind", "omp", "--local-root", localOmp], { env });
    Bun.spawnSync(["bun", cli, "track", "path", "remote-test.txt", "--root", "omp"], { env });
    execSync("git add . && git commit -m 'track file' && git push origin main", { cwd: repoDir, stdio: "ignore" });

    // Another clone pushes a new version of .omp/remote-test.txt to remote
    const clone2 = tempDir();
    execSync(`git clone "${remote}" "${clone2}"`, { stdio: "ignore" });
    execSync("git config user.name 'User 2'", { cwd: clone2, stdio: "ignore" });
    execSync("git config user.email 'u2@example.com'", { cwd: clone2, stdio: "ignore" });
    fs.mkdirSync(path.join(clone2, ".omp"), { recursive: true });
    fs.writeFileSync(path.join(clone2, ".omp", "remote-test.txt"), "content from user 2");
    execSync("git add . && git commit -m 'user 2 update' && git push origin main", { cwd: clone2, stdio: "ignore" });

    // Local run pull --apply --git-pull
    const pullProc = Bun.spawnSync(
      ["bun", cli, "pull", "--apply", "--git-pull"],
      { env }
    );
    expect(pullProc.exitCode).toBe(0);
    expect(fs.existsSync(path.join(localOmp, "remote-test.txt"))).toBe(true);
    expect(fs.readFileSync(path.join(localOmp, "remote-test.txt"), "utf8")).toBe("content from user 2");
  });
});

import { describe, expect, it } from "bun:test";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Plan, Result } from "@/scripts/lib/plan";
import { at } from "./helpers/at";
import {
  commitFile,
  git,
  initGitRepo,
  sha256,
  snapshotTree,
  tempDir,
  useIsolatedGitEnv,
} from "./helpers/git-fixtures";

describe("given ai-sync git remote integration, when syncing with git-enabled backup", () => {
  useIsolatedGitEnv();
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
    Bun.spawnSync(["bun", cli, "root", "add", "omp", "--kind", "path", "--repo-root", ".omp"], {
      env,
    });
    const localOmp = path.join(homeDir, "omp");
    fs.mkdirSync(localOmp, { recursive: true });
    Bun.spawnSync(["bun", cli, "root", "bind", "omp", "--local-root", localOmp], { env });
    Bun.spawnSync(["bun", cli, "track", "path", "test.txt", "--root", "omp"], { env });
    // The manifest belongs to the backup but not to this push's exported paths, so it is committed first.
    execSync("git add . && git commit -m 'track file' && git push origin main", {
      cwd: repoDir,
      stdio: "ignore",
    });

    fs.writeFileSync(path.join(localOmp, "test.txt"), "hello git push");

    const pushProc = Bun.spawnSync(
      [
        "bun",
        cli,
        "push",
        "--apply",
        "--target",
        "omp",
        "--git-push",
        "-m",
        "sync: automated push test",
      ],
      { env },
    );
    expect(pushProc.exitCode).toBe(0);

    // Verify remote received the push
    const verifyClone = tempDir();
    execSync(`git clone "${remote}" "${verifyClone}"`, { stdio: "ignore" });
    expect(fs.existsSync(path.join(verifyClone, ".omp", "test.txt"))).toBe(true);
    expect(fs.readFileSync(path.join(verifyClone, ".omp", "test.txt"), "utf8")).toBe(
      "hello git push",
    );
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
    Bun.spawnSync(["bun", cli, "root", "add", "omp", "--kind", "path", "--repo-root", ".omp"], {
      env,
    });
    const localOmp = path.join(homeDir, "omp");
    fs.mkdirSync(localOmp, { recursive: true });
    Bun.spawnSync(["bun", cli, "root", "bind", "omp", "--local-root", localOmp], { env });
    Bun.spawnSync(["bun", cli, "track", "path", "remote-test.txt", "--root", "omp"], { env });
    execSync("git add . && git commit -m 'track file' && git push origin main", {
      cwd: repoDir,
      stdio: "ignore",
    });

    // Another clone pushes a new version of .omp/remote-test.txt to remote
    const clone2 = tempDir();
    execSync(`git clone "${remote}" "${clone2}"`, { stdio: "ignore" });
    execSync("git config user.name 'User 2'", { cwd: clone2, stdio: "ignore" });
    execSync("git config user.email 'u2@example.com'", { cwd: clone2, stdio: "ignore" });
    fs.mkdirSync(path.join(clone2, ".omp"), { recursive: true });
    fs.writeFileSync(path.join(clone2, ".omp", "remote-test.txt"), "content from user 2");
    execSync("git add . && git commit -m 'user 2 update' && git push origin main", {
      cwd: clone2,
      stdio: "ignore",
    });

    // Local run pull --apply --git-pull
    const pullProc = Bun.spawnSync(
      ["bun", cli, "pull", "--apply", "--target", "omp", "--git-pull"],
      { env },
    );
    expect(pullProc.exitCode).toBe(0);
    expect(fs.existsSync(path.join(localOmp, "remote-test.txt"))).toBe(true);
    expect(fs.readFileSync(path.join(localOmp, "remote-test.txt"), "utf8")).toBe(
      "content from user 2",
    );
  });
});

interface CliOutput {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

interface CliScenario {
  remote: string;
  repo: string;
  home: string;
  local: string;
  author: string;
  run: (...args: string[]) => CliOutput;
}

const cliPath = path.join(import.meta.dir, "../scripts/sync.ts");

function resultOf(output: CliOutput): Result {
  return JSON.parse(output.stdout) as Result;
}

function codesOf(result: Result): string[] {
  return result.errors.map((error) => error.code);
}

/** A backup clone tracking `*.txt` under a `.omp` path root bound to `home/omp`, with its first commit pushed. */
function cliScenario(): CliScenario {
  const base = tempDir();
  const remote = path.join(base, "remote.git");
  fs.mkdirSync(remote);
  initGitRepo(remote, true);
  const repo = path.join(base, "repo");
  git(base, "clone", "-q", remote, repo);
  git(repo, "config", "user.name", "Backup User");
  git(repo, "config", "user.email", "backup@example.com");
  const home = path.join(base, "home");
  const local = path.join(home, "omp");
  fs.mkdirSync(local, { recursive: true });
  const env = { ...process.env, HOME: home, AI_CUSTOM_REPO: repo, GIT_CONFIG_NOSYSTEM: "1" };
  const run = (...args: string[]): CliOutput => {
    const done = Bun.spawnSync(["bun", cliPath, ...args], { env });
    return {
      exitCode: done.exitCode,
      stdout: done.stdout.toString(),
      stderr: done.stderr.toString(),
    };
  };
  run("init", repo);
  run("root", "add", "omp", "--kind", "path", "--repo-root", ".omp");
  run("root", "bind", "omp", "--local-root", local);
  run("track", "path", "*.txt", "--root", "omp");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "init backup");
  git(repo, "push", "-q", "-u", "origin", "main");
  const author = path.join(base, "author");
  git(base, "clone", "-q", remote, author);
  git(author, "config", "user.name", "Author");
  git(author, "config", "user.email", "author@example.com");
  return { remote, repo, home, local, author, run };
}

describe("given a backup with unrelated pending files, when pushing with --git-push", () => {
  useIsolatedGitEnv();

  it("previews exported and unrelated paths, blocks on unrelated paths, and mutates nothing", () => {
    const s = cliScenario();
    fs.writeFileSync(path.join(s.local, "test.txt"), "hello\n");
    const clean = s.run("push", "--target", "omp", "--git-push", "--format=json");
    expect(clean.exitCode).toBe(0);
    expect(resultOf(clean).outcome).toBe("preview");
    expect(resultOf(clean).git).toEqual({ exportedPaths: [".omp/test.txt"], unrelatedChanges: [] });

    fs.writeFileSync(path.join(s.repo, "notes.md"), "unrelated\n");
    fs.writeFileSync(
      path.join(s.repo, ".ai-sync", "manifest.json"),
      `${fs.readFileSync(path.join(s.repo, ".ai-sync", "manifest.json"), "utf8")}\n`,
    );
    const before = snapshotTree(s.repo);
    const dirty = s.run("push", "--target", "omp", "--git-push", "--format=json");

    expect(dirty.exitCode).not.toBe(0);
    const value = resultOf(dirty);
    expect(value.outcome).toBe("failed");
    expect(codesOf(value)).toEqual(["GIT_DIRTY_UNRELATED"]);
    expect(value.git).toEqual({
      exportedPaths: [".omp/test.txt"],
      unrelatedChanges: [".ai-sync/manifest.json", "notes.md"],
    });
    expect(at(value.errors, 0).message).toContain("notes.md");
    expect(value.actions.every((action) => action.state === "not_attempted")).toBe(true);
    expect(snapshotTree(s.repo)).toEqual(before);
  });

  it("aborts --apply before exporting, staging, committing, or pushing, and lists the unrelated paths", () => {
    const s = cliScenario();
    fs.writeFileSync(path.join(s.local, "test.txt"), "hello\n");
    fs.writeFileSync(path.join(s.repo, "notes.md"), "unrelated\n");
    const headBefore = git(s.repo, "rev-parse", "HEAD");
    const remoteBefore = git(s.remote, "rev-parse", "main");
    const before = snapshotTree(s.repo);

    const applied = s.run("push", "--apply", "--target", "omp", "--git-push", "--format=json");

    expect(applied.exitCode).not.toBe(0);
    const value = resultOf(applied);
    expect(codesOf(value)).toEqual(["GIT_DIRTY_UNRELATED"]);
    expect(at(value.errors, 0).message).toContain("notes.md");
    expect(git(s.repo, "rev-parse", "HEAD")).toBe(headBefore);
    expect(git(s.remote, "rev-parse", "main")).toBe(remoteBefore);
    expect(snapshotTree(s.repo)).toEqual(before);
    expect(fs.existsSync(path.join(s.repo, ".omp", "test.txt"))).toBe(false);
  });

  it("refuses --git-push with --plan-out instead of silently dropping the push", () => {
    const s = cliScenario();
    fs.writeFileSync(path.join(s.local, "test.txt"), "hello\n");
    const planFile = path.join(tempDir(), "push.plan.json");

    const refused = s.run(
      "push",
      "--target",
      "omp",
      "--git-push",
      "--plan-out",
      planFile,
      "--format=json",
    );

    expect(refused.exitCode).not.toBe(0);
    const value = resultOf(refused);
    expect(codesOf(value)).toEqual(["PLAN_INVALID"]);
    expect(value.recovery).toContain("--git-push on a direct push apply");
    expect(fs.existsSync(planFile)).toBe(false);
  });

  it("commits only the --target omp export, even when its path was already staged", () => {
    const s = cliScenario();
    fs.mkdirSync(path.join(s.repo, ".omp"), { recursive: true });
    fs.writeFileSync(path.join(s.repo, ".omp", "test.txt"), "stale staged copy\n");
    git(s.repo, "add", ".omp/test.txt");
    fs.writeFileSync(path.join(s.local, "test.txt"), "fresh\n");

    const applied = s.run(
      "push",
      "--apply",
      "--target",
      "omp",
      "--git-push",
      "-m",
      "sync: scoped",
      "--format=json",
    );

    expect(applied.exitCode).toBe(0);
    expect(resultOf(applied).outcome).toBe("success");
    expect(git(s.repo, "show", "--name-only", "--format=%s", "HEAD").split("\n")).toEqual([
      "sync: scoped",
      "",
      ".omp/test.txt",
    ]);
    expect(git(s.remote, "show", "main:.omp/test.txt")).toBe("fresh");
  });
});

describe("given a remote that moved, when previewing and applying pull --git-pull", () => {
  useIsolatedGitEnv();

  function authorPush(s: CliScenario, file: string, content: string): string {
    const head = commitFile(s.author, file, content);
    git(s.author, "push", "-q", "origin", "main");
    return head;
  }

  it("previews incoming actions from a temporary repository and changes nothing, not even refs or the index", () => {
    const s = cliScenario();
    const remoteHead = authorPush(s, ".omp/remote.txt", "from remote\n");
    fs.writeFileSync(path.join(s.repo, ".ai-sync", "scratch.tmp"), "x\n");
    const before = snapshotTree(s.repo);
    const refs = git(s.repo, "for-each-ref");

    const preview = s.run("pull", "--target", "omp", "--git-pull", "--format=json");

    expect(preview.exitCode).toBe(0);
    const value = resultOf(preview);
    expect(value.outcome).toBe("preview");
    expect(value.git?.incoming).toEqual([{ path: ".omp/remote.txt", action: "add" }]);
    expect(value.git?.conflicts).toEqual([]);
    expect(value.git?.remoteCommit).toBe(remoteHead);
    expect(value.git?.limitation).toContain(".omp/remote.txt");
    expect(JSON.stringify(value)).not.toContain(s.remote);
    expect(snapshotTree(s.repo)).toEqual(before);
    expect(git(s.repo, "for-each-ref")).toBe(refs);
  });

  it("reports a conflict as a failed preview with no dependent restore actions", () => {
    const s = cliScenario();
    commitFile(s.repo, ".omp/test.txt", "local edit\n");
    authorPush(s, ".omp/test.txt", "author edit\n");
    fs.writeFileSync(path.join(s.local, "test.txt"), "machine copy\n");
    const before = snapshotTree(s.repo);

    const preview = s.run("pull", "--target", "omp", "--git-pull", "--format=json");

    expect(preview.exitCode).not.toBe(0);
    const value = resultOf(preview);
    expect(value.outcome).toBe("failed");
    expect(codesOf(value)).toEqual(["GIT_CONFLICT"]);
    expect(value.git?.conflicts).toEqual([".omp/test.txt"]);
    expect(value.actions.every((action) => action.state === "not_attempted")).toBe(true);
    expect(snapshotTree(s.repo)).toEqual(before);
  });

  it("blocks --apply on a conflict: no pull, no merge in progress, no restored file", () => {
    const s = cliScenario();
    commitFile(s.repo, ".omp/test.txt", "local edit\n");
    commitFile(s.author, ".omp/test.txt", "author edit\n");
    git(s.author, "push", "-q", "origin", "main");
    const headBefore = git(s.repo, "rev-parse", "HEAD");
    fs.writeFileSync(path.join(s.local, "test.txt"), "machine copy\n");

    const applied = s.run("pull", "--apply", "--target", "omp", "--git-pull", "--format=json");

    expect(applied.exitCode).not.toBe(0);
    expect(codesOf(resultOf(applied))).toEqual(["GIT_CONFLICT"]);
    expect(git(s.repo, "rev-parse", "HEAD")).toBe(headBefore);
    expect(fs.existsSync(path.join(s.repo, ".git", "MERGE_HEAD"))).toBe(false);
    expect(fs.readFileSync(path.join(s.local, "test.txt"), "utf8")).toBe("machine copy\n");
  });

  it("blocks when a dirty backup file overlaps an incoming path", () => {
    const s = cliScenario();
    authorPush(s, ".omp/remote.txt", "from remote\n");
    fs.mkdirSync(path.join(s.repo, ".omp"), { recursive: true });
    fs.writeFileSync(path.join(s.repo, ".omp", "remote.txt"), "dirty local\n");
    const before = snapshotTree(s.repo);

    const preview = s.run("pull", "--target", "omp", "--git-pull", "--format=json");

    expect(preview.exitCode).not.toBe(0);
    expect(codesOf(resultOf(preview))).toEqual(["GIT_DIRTY_UNRELATED"]);
    expect(snapshotTree(s.repo)).toEqual(before);
  });

  it("reports a repository that is not a Git repository as GIT_FAILED in preview and apply", () => {
    const s = cliScenario();
    fs.rmSync(path.join(s.repo, ".git"), { recursive: true, force: true });
    fs.writeFileSync(path.join(s.local, "test.txt"), "machine\n");
    fs.mkdirSync(path.join(s.repo, ".omp"), { recursive: true });
    fs.writeFileSync(path.join(s.repo, ".omp", "test.txt"), "repo\n");

    const preview = s.run("pull", "--target", "omp", "--git-pull", "--format=json");
    expect(preview.exitCode).not.toBe(0);
    expect(codesOf(resultOf(preview))).toEqual(["GIT_FAILED"]);
    const applied = s.run("pull", "--apply", "--target", "omp", "--git-pull", "--format=json");
    expect(applied.exitCode).not.toBe(0);
    expect(codesOf(resultOf(applied))).toEqual(["GIT_FAILED"]);
    expect(fs.readFileSync(path.join(s.local, "test.txt"), "utf8")).toBe("machine\n");
  });

  it("pulls and restores with --apply when the preview is clean", () => {
    const s = cliScenario();
    authorPush(s, ".omp/remote.txt", "from remote\n");

    const applied = s.run("pull", "--apply", "--target", "omp", "--git-pull", "--format=json");

    expect(applied.exitCode).toBe(0);
    expect(fs.readFileSync(path.join(s.local, "remote.txt"), "utf8")).toBe("from remote\n");
  });
});

describe("given a saved pull plan with Git steps, when it is applied", () => {
  useIsolatedGitEnv();

  /** The backup already holds a newer `test.txt` than this machine; the remote then adds an unrelated README. */
  function planned(): { s: CliScenario; planFile: string; saved: Plan } {
    const s = cliScenario();
    commitFile(s.repo, ".omp/test.txt", "newer backup\n");
    git(s.repo, "push", "-q", "origin", "main");
    git(s.author, "pull", "-q");
    commitFile(s.author, "README.md", "remote readme\n");
    git(s.author, "push", "-q", "origin", "main");
    fs.writeFileSync(path.join(s.local, "test.txt"), "old machine copy\n");
    const planFile = path.join(tempDir(), "pull.plan.json");
    const saved = s.run(
      "pull",
      "--target",
      "omp",
      "--git-pull",
      "--plan-out",
      planFile,
      "--format=json",
    );
    expect(saved.exitCode).toBe(0);
    return { s, planFile, saved: JSON.parse(fs.readFileSync(planFile, "utf8")) as Plan };
  }

  it("records a real GitPlan without the remote URL", () => {
    const { s, saved } = planned();
    expect(saved.git).toMatchObject({
      remoteRef: "refs/heads/main",
      remoteCommit: git(s.author, "rev-parse", "HEAD"),
      localHead: git(s.repo, "rev-parse", "HEAD"),
      indexClean: true,
      worktreeClean: true,
      exportedPaths: [],
      unrelatedChanges: [],
    });
    expect(saved.git?.remoteUrlHash).toBe(sha256(git(s.repo, "remote", "get-url", "origin")));
    expect(JSON.stringify(saved)).not.toContain(s.remote);
  });

  it("pulls the approved commit, then restores", () => {
    const { s, planFile, saved } = planned();

    const applied = s.run("apply", planFile, "--apply", "--format=json");

    expect(applied.exitCode).toBe(0);
    expect(resultOf(applied).outcome).toBe("success");
    expect(saved.git).not.toBeNull();
    expect(git(s.repo, "rev-parse", "HEAD")).toBe(String(saved.git?.remoteCommit));
    expect(fs.readFileSync(path.join(s.local, "test.txt"), "utf8")).toBe("newer backup\n");
  });

  it.each([
    [
      "the remote advanced",
      "GIT_REMOTE_ADVANCED",
      (s: CliScenario): void => {
        commitFile(s.author, "late.md", "late\n");
        git(s.author, "push", "-q", "origin", "main");
      },
    ],
    [
      "an unrelated backup file changed",
      "GIT_DIRTY_UNRELATED",
      (s: CliScenario): void => {
        fs.writeFileSync(path.join(s.repo, "scratch.md"), "new\n");
      },
    ],
    [
      "the local HEAD moved",
      "GIT_DIRTY_UNRELATED",
      (s: CliScenario): void => {
        commitFile(s.repo, "local.md", "local\n");
      },
    ],
  ])("rejects the plan before any pull or restore when %s", (_name, code, change) => {
    const { s, planFile } = planned();
    change(s);
    const headBefore = git(s.repo, "rev-parse", "HEAD");
    const machineBefore = fs.readFileSync(path.join(s.local, "test.txt"), "utf8");

    const preview = s.run("apply", planFile, "--format=json");
    expect(preview.exitCode).not.toBe(0);
    expect(codesOf(resultOf(preview))).toEqual([code]);

    const applied = s.run("apply", planFile, "--apply", "--format=json");

    expect(applied.exitCode).not.toBe(0);
    const value = resultOf(applied);
    expect(value.outcome).toBe("failed");
    expect(codesOf(value)).toEqual([code]);
    expect(value.actions.every((action) => action.state === "not_attempted")).toBe(true);
    expect(git(s.repo, "rev-parse", "HEAD")).toBe(headBefore);
    expect(fs.readFileSync(path.join(s.local, "test.txt"), "utf8")).toBe(machineBefore);
  });

  it("refuses to save a plan whose restore actions depend on incoming changes", () => {
    const s = cliScenario();
    commitFile(s.repo, ".omp/test.txt", "backup\n");
    git(s.repo, "push", "-q", "origin", "main");
    git(s.author, "pull", "-q");
    commitFile(s.author, ".omp/test.txt", "incoming\n");
    git(s.author, "push", "-q", "origin", "main");
    fs.writeFileSync(path.join(s.local, "test.txt"), "machine\n");
    const planFile = path.join(tempDir(), "pull.plan.json");

    const saved = s.run(
      "pull",
      "--target",
      "omp",
      "--git-pull",
      "--plan-out",
      planFile,
      "--format=json",
    );

    expect(saved.exitCode).not.toBe(0);
    expect(codesOf(resultOf(saved))).toEqual(["GIT_SIMULATION_FAILED"]);
    expect(fs.existsSync(planFile)).toBe(false);
  });

  it("rejects a plan whose git field is malformed", () => {
    const { s, planFile, saved } = planned();
    fs.writeFileSync(
      planFile,
      JSON.stringify({ ...saved, git: { ...saved.git, remoteUrlHash: 7 } }),
    );

    const applied = s.run("apply", planFile, "--apply", "--format=json");

    expect(applied.exitCode).not.toBe(0);
    expect(codesOf(resultOf(applied))).toEqual(["PLAN_INVALID"]);
  });

  it("rejects git steps on a push plan", () => {
    const { s, planFile, saved } = planned();
    fs.writeFileSync(planFile, JSON.stringify({ ...saved, operation: "push" }));
    expect(codesOf(resultOf(s.run("apply", planFile, "--apply", "--format=json")))).toEqual([
      "PLAN_INVALID",
    ]);
  });
});

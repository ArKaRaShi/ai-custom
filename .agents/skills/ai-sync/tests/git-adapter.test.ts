import { describe, expect, it } from "bun:test";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { git as gateway } from "@/scripts/io/git/git";
import type { RemoteIntegrationPreview } from "@/scripts/lib/git";
import type { GitPlan } from "@/scripts/lib/plan";
import {
  commitFile,
  git,
  initGitRepo,
  makeScenario,
  pushAuthor,
  type Scenario,
  sha256,
  snapshotTree,
  tempDir,
  useIsolatedGitEnv,
} from "./helpers/git-fixtures";

function savedGitFrom(
  local: string,
  preview: RemoteIntegrationPreview,
  exportedPaths: string[] = [],
): GitPlan {
  const state = gateway.inspectLocalState(local, exportedPaths);
  return {
    remoteUrlHash: preview.remoteUrlHash,
    remoteRef: preview.remoteRef,
    remoteCommit: preview.remoteCommit,
    localHead: state.localHead,
    indexClean: state.indexClean,
    worktreeClean: state.worktreeClean,
    exportedPaths,
    unrelatedChanges: state.unrelatedChanges,
  };
}

describe("given ai-sync git remote integration, when syncing with git-enabled backup", () => {
  useIsolatedGitEnv();
  it("gitPullChecked pulls latest commits from remote upstream", () => {
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

    // clone2 pulls through the checked helper
    const preview = gateway.previewRemoteIntegration(clone2);
    expect(preview.blocked).toBeNull();
    const pullResult = gateway.pullChecked(clone2, {
      remoteUrlHash: preview.remoteUrlHash,
      remoteRef: preview.remoteRef,
      remoteCommit: preview.remoteCommit,
      localHead: preview.localHead,
      indexClean: preview.indexClean,
      worktreeClean: preview.worktreeClean,
      exportedPaths: [],
      unrelatedChanges: [],
    });
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
    const pushResult = gateway.commitAndPush(clone, ["exported-skill.md"], "sync: export skills");
    expect(pushResult.success).toBe(true);

    // Verify remote has the commit
    const verifyClone = tempDir();
    execSync(`git clone "${remote}" "${verifyClone}"`, { stdio: "ignore" });
    expect(fs.existsSync(path.join(verifyClone, "exported-skill.md"))).toBe(true);
  });
});

describe("given a backup repository with a remote, when previewing remote integration", () => {
  useIsolatedGitEnv();

  it("reports fast-forward incoming add/modify/delete without touching the real repository", () => {
    const s = makeScenario("remote-secret-token.git");
    commitFile(s.author, "a.txt", "a2\n");
    git(s.author, "rm", "-q", "b.txt");
    commitFile(s.author, "new/n.txt", "n\n", "add and delete");
    const remoteHead = pushAuthor(s);
    // Stale the index stat info: a plain `git status` would rewrite .git/index.
    const aPath = path.join(s.local, "a.txt");
    fs.writeFileSync(aPath, fs.readFileSync(aPath));
    fs.utimesSync(aPath, new Date(2001, 1, 1), new Date(2001, 1, 1));
    const before = snapshotTree(s.local);
    const refsBefore = git(s.local, "for-each-ref");
    const statusBefore = git(s.local, "--no-optional-locks", "status", "--porcelain");

    const preview = gateway.previewRemoteIntegration(s.local);

    expect(preview.blocked).toBeNull();
    expect(preview.remoteRef).toBe("refs/heads/main");
    expect(preview.remoteCommit).toBe(remoteHead);
    expect(preview.localHead).toBe(git(s.local, "rev-parse", "HEAD"));
    expect(preview.indexClean).toBe(true);
    expect(preview.worktreeClean).toBe(true);
    expect(preview.conflicts).toEqual([]);
    expect([...preview.incoming].sort((x, y) => x.path.localeCompare(y.path))).toEqual([
      { path: "a.txt", action: "modify" },
      { path: "b.txt", action: "delete" },
      { path: "new/n.txt", action: "add" },
    ]);
    expect(snapshotTree(s.local)).toEqual(before);
    expect(git(s.local, "for-each-ref")).toBe(refsBefore);
    expect(git(s.local, "--no-optional-locks", "status", "--porcelain")).toBe(statusBefore);
    expect(git(s.local, "rev-parse", "HEAD")).toBe(preview.localHead);
  });

  it("returns only a hash of the remote URL, never the URL, path, or credentials", () => {
    const s = makeScenario("remote-secret-token.git");
    commitFile(s.author, "x.txt", "x\n");
    pushAuthor(s);
    const url = git(s.local, "remote", "get-url", "origin");

    const preview = gateway.previewRemoteIntegration(s.local);

    expect(preview.remoteUrlHash).toBe(sha256(url));
    const serialized = JSON.stringify(preview);
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain(url);
  });

  it("reports no incoming paths when local already contains the remote commit", () => {
    const s = makeScenario();
    commitFile(s.local, "local-only.txt", "l\n");

    const preview = gateway.previewRemoteIntegration(s.local);

    expect(preview.blocked).toBeNull();
    expect(preview.incoming).toEqual([]);
    expect(preview.conflicts).toEqual([]);
  });

  it("simulates a clean merge of diverged histories", () => {
    const s = makeScenario();
    commitFile(s.local, "local.txt", "l\n");
    commitFile(s.author, "remote.txt", "r\n");
    pushAuthor(s);
    const before = snapshotTree(s.local);

    const preview = gateway.previewRemoteIntegration(s.local);

    expect(preview.blocked).toBeNull();
    expect(preview.incoming).toEqual([{ path: "remote.txt", action: "add" }]);
    expect(preview.conflicts).toEqual([]);
    expect(snapshotTree(s.local)).toEqual(before);
  });

  it("blocks diverged histories that conflict and lists the conflicted paths", () => {
    const s = makeScenario();
    commitFile(s.local, "a.txt", "local edit\n");
    commitFile(s.author, "a.txt", "remote edit\n");
    pushAuthor(s);
    const before = snapshotTree(s.local);

    const preview = gateway.previewRemoteIntegration(s.local);

    expect(preview.conflicts).toEqual(["a.txt"]);
    expect(preview.blocked?.code).toBe("GIT_CONFLICT");
    expect(snapshotTree(s.local)).toEqual(before);
  });

  it("blocks when a dirty local path overlaps an incoming path, but not when unrelated", () => {
    const s = makeScenario();
    commitFile(s.author, "a.txt", "remote a\n");
    pushAuthor(s);
    fs.writeFileSync(path.join(s.local, "b.txt"), "dirty unrelated\n");
    const unrelated = gateway.previewRemoteIntegration(s.local);
    expect(unrelated.blocked).toBeNull();
    expect(unrelated.worktreeClean).toBe(false);

    fs.writeFileSync(path.join(s.local, "a.txt"), "dirty overlap\n");
    const before = snapshotTree(s.local);
    const overlap = gateway.previewRemoteIntegration(s.local);
    expect(overlap.blocked?.code).toBe("GIT_DIRTY_UNRELATED");
    expect(overlap.blocked?.reason).toContain("a.txt");
    expect(snapshotTree(s.local)).toEqual(before);
  });

  it("blocks when an untracked local file would be overwritten by an incoming add", () => {
    const s = makeScenario();
    commitFile(s.author, "fresh.txt", "remote\n");
    pushAuthor(s);
    fs.writeFileSync(path.join(s.local, "fresh.txt"), "untracked local\n");

    const preview = gateway.previewRemoteIntegration(s.local);

    expect(preview.blocked?.code).toBe("GIT_DIRTY_UNRELATED");
  });

  it("blocks a merge of diverged histories while changes are staged", () => {
    const s = makeScenario();
    commitFile(s.local, "local.txt", "l\n");
    commitFile(s.author, "remote.txt", "r\n");
    pushAuthor(s);
    fs.writeFileSync(path.join(s.local, "staged.txt"), "s\n");
    git(s.local, "add", "staged.txt");

    const preview = gateway.previewRemoteIntegration(s.local);

    expect(preview.indexClean).toBe(false);
    expect(preview.blocked?.code).toBe("GIT_DIRTY_UNRELATED");
  });

  it("resolves a relative remote URL against the repository, and hashes the URL as configured", () => {
    const s = makeScenario();
    commitFile(s.author, "x.txt", "x\n");
    pushAuthor(s);
    git(s.local, "remote", "set-url", "origin", `../${path.basename(s.remote)}`);

    const preview = gateway.previewRemoteIntegration(s.local);

    expect(preview.blocked).toBeNull();
    expect(preview.incoming).toEqual([{ path: "x.txt", action: "add" }]);
    expect(preview.remoteUrlHash).toBe(sha256(`../${path.basename(s.remote)}`));
  });

  it("reports staged changes through indexClean", () => {
    const s = makeScenario();
    fs.writeFileSync(path.join(s.local, "staged.txt"), "s\n");
    git(s.local, "add", "staged.txt");

    const preview = gateway.previewRemoteIntegration(s.local);

    expect(preview.indexClean).toBe(false);
    expect(preview.worktreeClean).toBe(true);
  });

  it.each([
    ["pull.rebase=true", ["config", "pull.rebase", "true"]],
    ["pull.rebase=merges", ["config", "pull.rebase", "merges"]],
    ["pull.ff=false", ["config", "pull.ff", "false"]],
    ["core.hooksPath", ["config", "core.hooksPath", ".githooks"]],
    ["filter.*", ["config", "filter.lfs.clean", "cat"]],
    ["core.autocrlf=true", ["config", "core.autocrlf", "true"]],
    ["core.sparseCheckout", ["config", "core.sparseCheckout", "true"]],
  ])("blocks unsupported configuration %s with GIT_UNSUPPORTED_CONFIG", (_name, args) => {
    const s = makeScenario();
    commitFile(s.author, "x.txt", "x\n");
    pushAuthor(s);
    git(s.local, ...args);
    const before = snapshotTree(s.local);

    const preview = gateway.previewRemoteIntegration(s.local);

    expect(preview.blocked?.code).toBe("GIT_UNSUPPORTED_CONFIG");
    expect(snapshotTree(s.local)).toEqual(before);
  });

  it("accepts the allowlisted configuration values", () => {
    const s = makeScenario();
    commitFile(s.author, "x.txt", "x\n");
    pushAuthor(s);
    git(s.local, "config", "pull.rebase", "false");
    git(s.local, "config", "pull.ff", "only");
    git(s.local, "config", "core.autocrlf", "false");

    const preview = gateway.previewRemoteIntegration(s.local);

    expect(preview.blocked).toBeNull();
    expect(preview.incoming).toEqual([{ path: "x.txt", action: "add" }]);
  });

  it("blocks a tracked .gitmodules in the local tree or in the remote commit", () => {
    const remoteHas = makeScenario();
    commitFile(remoteHas.author, ".gitmodules", '[submodule "x"]\n\tpath = x\n\turl = ../x\n');
    pushAuthor(remoteHas);
    expect(gateway.previewRemoteIntegration(remoteHas.local).blocked?.code).toBe(
      "GIT_UNSUPPORTED_CONFIG",
    );

    const localHas = makeScenario();
    commitFile(localHas.local, ".gitmodules", '[submodule "x"]\n\tpath = x\n\turl = ../x\n');
    expect(gateway.previewRemoteIntegration(localHas.local).blocked?.code).toBe(
      "GIT_UNSUPPORTED_CONFIG",
    );
  });

  it("blocks shallow clones", () => {
    const s = makeScenario();
    const shallow = path.join(tempDir(), "shallow");
    git(os.tmpdir(), "clone", "-q", "--depth", "1", `file://${s.remote}`, shallow);

    const preview = gateway.previewRemoteIntegration(shallow);

    expect(preview.blocked?.code).toBe("GIT_UNSUPPORTED_CONFIG");
  });

  it("blocks diverged histories when pull.ff=only forbids a merge", () => {
    const s = makeScenario();
    git(s.local, "config", "pull.ff", "only");
    commitFile(s.local, "local.txt", "l\n");
    commitFile(s.author, "remote.txt", "r\n");
    pushAuthor(s);

    const preview = gateway.previewRemoteIntegration(s.local);

    expect(preview.blocked?.code).toBe("GIT_SIMULATION_FAILED");
  });

  it("requires an explicit remote when several remotes exist", () => {
    const s = makeScenario();
    git(s.local, "remote", "add", "second", s.remote);
    commitFile(s.author, "x.txt", "x\n");
    pushAuthor(s);

    expect(gateway.previewRemoteIntegration(s.local).blocked?.code).toBe("GIT_UNSUPPORTED_CONFIG");
    expect(gateway.previewRemoteIntegration(s.local, { remote: "second" }).blocked).toBeNull();
  });

  it("normalizes a short ref name to a full ref", () => {
    const s = makeScenario();
    const preview = gateway.previewRemoteIntegration(s.local, { remote: "origin", ref: "main" });
    expect(preview.remoteRef).toBe("refs/heads/main");
  });

  it("reports GIT_SIMULATION_FAILED for an unreachable remote or a missing ref, with no URL or credentials in the reason", () => {
    const s = makeScenario();
    const missingRef = gateway.previewRemoteIntegration(s.local, { ref: "refs/heads/nope" });
    expect(missingRef.blocked?.code).toBe("GIT_SIMULATION_FAILED");

    git(
      s.local,
      "remote",
      "set-url",
      "origin",
      "https://leaky-user:leaky-pass@127.0.0.1:1/repo.git",
    );
    const unreachable = gateway.previewRemoteIntegration(s.local);
    expect(unreachable.blocked?.code).toBe("GIT_SIMULATION_FAILED");
    const serialized = JSON.stringify(unreachable);
    expect(serialized).not.toContain("leaky");
    expect(serialized).not.toContain("127.0.0.1");
  });

  it("removes its temporary repository even when the simulation is blocked", () => {
    const s = makeScenario();
    commitFile(s.local, "a.txt", "local\n");
    commitFile(s.author, "a.txt", "remote\n");
    pushAuthor(s);
    const scratch = tempDir();
    const previousTmp = process.env.TMPDIR;
    process.env.TMPDIR = scratch;
    try {
      expect(gateway.previewRemoteIntegration(s.local).blocked?.code).toBe("GIT_CONFLICT");
      git(s.local, "remote", "set-url", "origin", path.join(scratch, "missing.git"));
      expect(gateway.previewRemoteIntegration(s.local).blocked?.code).toBe("GIT_SIMULATION_FAILED");
      expect(fs.readdirSync(scratch)).toEqual([]);
    } finally {
      if (previousTmp === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previousTmp;
    }
  });

  it("rejects a directory that is not a git repository without throwing", () => {
    const preview = gateway.previewRemoteIntegration(tempDir());
    expect(preview.blocked?.code).toBe("GIT_SIMULATION_FAILED");
  });
});

describe("given a saved git plan, when revalidating before apply", () => {
  useIsolatedGitEnv();

  function planned(s: Scenario, exportedPaths: string[] = []): GitPlan {
    const preview = gateway.previewRemoteIntegration(s.local);
    expect(preview.blocked).toBeNull();
    return savedGitFrom(s.local, preview, exportedPaths);
  }

  function advanced(): Scenario {
    const s = makeScenario();
    commitFile(s.author, "a.txt", "a2\n");
    pushAuthor(s);
    return s;
  }

  it("accepts unchanged remote and local state", () => {
    const s = advanced();
    const saved = planned(s);
    expect(gateway.revalidate(s.local, saved)).toEqual({ ok: true });
  });

  it("rejects a remote that advanced after the preview with GIT_REMOTE_ADVANCED", () => {
    const s = advanced();
    const saved = planned(s);
    commitFile(s.author, "late.txt", "late\n");
    pushAuthor(s);

    const result = gateway.revalidate(s.local, saved);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("GIT_REMOTE_ADVANCED");
  });

  it("rejects a changed local file with GIT_DIRTY_UNRELATED", () => {
    const s = advanced();
    const saved = planned(s);
    fs.writeFileSync(path.join(s.local, "b.txt"), "changed after preview\n");

    const result = gateway.revalidate(s.local, saved);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("GIT_DIRTY_UNRELATED");
      expect(result.reason).toContain("b.txt");
    }
  });

  it("rejects staged changes and a moved local HEAD", () => {
    const s = advanced();
    const saved = planned(s);
    fs.writeFileSync(path.join(s.local, "staged.txt"), "s\n");
    git(s.local, "add", "staged.txt");
    const staged = gateway.revalidate(s.local, saved);
    expect(staged.ok).toBe(false);
    if (!staged.ok) expect(staged.code).toBe("GIT_DIRTY_UNRELATED");

    git(s.local, "commit", "-q", "-m", "moves head");
    const moved = gateway.revalidate(s.local, saved);
    expect(moved.ok).toBe(false);
    if (!moved.ok) expect(moved.code).toBe("GIT_DIRTY_UNRELATED");
  });

  it("treats changes inside exportedPaths as related", () => {
    const s = advanced();
    fs.writeFileSync(path.join(s.local, "b.txt"), "exported edit\n");
    const saved = planned(s, ["b.txt"]);
    expect(saved.unrelatedChanges).toEqual([]);
    expect(saved.worktreeClean).toBe(false);
    expect(gateway.revalidate(s.local, saved)).toEqual({ ok: true });

    fs.writeFileSync(path.join(s.local, "dir", "c.txt"), "unrelated edit\n");
    const result = gateway.revalidate(s.local, saved);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("GIT_DIRTY_UNRELATED");
  });

  it("rejects a saved plan whose simulation conflicts with GIT_CONFLICT", () => {
    const s = makeScenario();
    commitFile(s.local, "a.txt", "local edit\n");
    commitFile(s.author, "a.txt", "remote edit\n");
    pushAuthor(s);
    const preview = gateway.previewRemoteIntegration(s.local);
    expect(preview.blocked?.code).toBe("GIT_CONFLICT");
    const saved = savedGitFrom(s.local, preview);

    const result = gateway.revalidate(s.local, saved);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("GIT_CONFLICT");
  });

  it("rejects with GIT_SIMULATION_FAILED when the simulation can no longer run", () => {
    const s = advanced();
    const saved = planned(s);

    git(s.local, "config", "pull.rebase", "true");
    const unsupported = gateway.revalidate(s.local, saved);
    expect(unsupported.ok).toBe(false);
    if (!unsupported.ok) expect(unsupported.code).toBe("GIT_SIMULATION_FAILED");
    git(s.local, "config", "--unset", "pull.rebase");

    const unknownRemote = gateway.revalidate(s.local, {
      ...saved,
      remoteUrlHash: sha256("some other remote"),
    });
    expect(unknownRemote.ok).toBe(false);
    if (!unknownRemote.ok) expect(unknownRemote.code).toBe("GIT_SIMULATION_FAILED");

    fs.rmSync(s.remote, { recursive: true, force: true });
    const gone = gateway.revalidate(s.local, saved);
    expect(gone.ok).toBe(false);
    if (!gone.ok) {
      expect(gone.code).toBe("GIT_SIMULATION_FAILED");
      expect(gone.reason).not.toContain(s.remote);
    }
  });
});

describe("given a saved git plan, when pulling with revalidation", () => {
  useIsolatedGitEnv();

  function plannedAdvance(): { s: Scenario; saved: GitPlan } {
    const s = makeScenario();
    commitFile(s.author, "update.txt", "u\n");
    pushAuthor(s);
    const preview = gateway.previewRemoteIntegration(s.local);
    expect(preview.blocked).toBeNull();
    return { s, saved: savedGitFrom(s.local, preview) };
  }

  it("pulls exactly the approved remote commit after revalidation", () => {
    const { s, saved } = plannedAdvance();

    const result = gateway.pullChecked(s.local, saved);

    expect(result.success).toBe(true);
    expect(git(s.local, "rev-parse", "HEAD")).toBe(saved.remoteCommit);
    expect(fs.existsSync(path.join(s.local, "update.txt"))).toBe(true);
  });

  it("merges approved diverged histories", () => {
    const s = makeScenario();
    commitFile(s.local, "local.txt", "l\n");
    commitFile(s.author, "remote.txt", "r\n");
    pushAuthor(s);
    const preview = gateway.previewRemoteIntegration(s.local);
    const saved = savedGitFrom(s.local, preview);

    const result = gateway.pullChecked(s.local, saved);

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(s.local, "remote.txt"))).toBe(true);
    expect(fs.existsSync(path.join(s.local, "local.txt"))).toBe(true);
  });

  it("rejects an advanced remote before pulling anything", () => {
    const { s, saved } = plannedAdvance();
    commitFile(s.author, "late.txt", "late\n");
    pushAuthor(s);
    const before = snapshotTree(s.local);

    const result = gateway.pullChecked(s.local, saved);

    expect(result).toMatchObject({ success: false, code: "GIT_REMOTE_ADVANCED" });
    expect(snapshotTree(s.local)).toEqual(before);
  });

  it("rejects a changed local file before pulling anything", () => {
    const { s, saved } = plannedAdvance();
    fs.writeFileSync(path.join(s.local, "a.txt"), "changed\n");
    const before = snapshotTree(s.local);

    const result = gateway.pullChecked(s.local, saved);

    expect(result).toMatchObject({ success: false, code: "GIT_DIRTY_UNRELATED" });
    expect(snapshotTree(s.local)).toEqual(before);
  });

  it("rejects a conflicting plan before pulling anything", () => {
    const s = makeScenario();
    commitFile(s.local, "a.txt", "local edit\n");
    commitFile(s.author, "a.txt", "remote edit\n");
    pushAuthor(s);
    const saved = savedGitFrom(s.local, gateway.previewRemoteIntegration(s.local));
    const before = snapshotTree(s.local);

    const result = gateway.pullChecked(s.local, saved);

    expect(result).toMatchObject({ success: false, code: "GIT_CONFLICT" });
    expect(snapshotTree(s.local)).toEqual(before);
  });

  it("rejects a failed simulation before pulling anything", () => {
    const { s, saved } = plannedAdvance();
    git(s.local, "config", "core.hooksPath", ".githooks");
    const before = snapshotTree(s.local);

    const result = gateway.pullChecked(s.local, saved);

    expect(result).toMatchObject({ success: false, code: "GIT_SIMULATION_FAILED" });
    expect(snapshotTree(s.local)).toEqual(before);
  });

  it("reports GIT_FAILED and leaves no half-finished merge when the merge step fails", () => {
    const s = makeScenario();
    commitFile(s.local, "local.txt", "l\n");
    commitFile(s.author, "remote.txt", "r\n");
    pushAuthor(s);
    const saved = savedGitFrom(s.local, gateway.previewRemoteIntegration(s.local));
    const hook = path.join(s.local, ".git", "hooks", "pre-merge-commit");
    fs.writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    const headBefore = git(s.local, "rev-parse", "HEAD");

    const result = gateway.pullChecked(s.local, saved);

    expect(result).toMatchObject({ success: false, code: "GIT_FAILED" });
    expect(git(s.local, "rev-parse", "HEAD")).toBe(headBefore);
    expect(fs.existsSync(path.join(s.local, ".git", "MERGE_HEAD"))).toBe(false);
    expect(git(s.local, "status", "--porcelain")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// T015: scoped commits and Git preview/revalidation wired into the CLI
// ---------------------------------------------------------------------------

describe("given exported paths and unrelated pending changes, when committing and pushing", () => {
  useIsolatedGitEnv();

  function backup(): { remote: string; repo: string } {
    const base = tempDir();
    const remote = path.join(base, "remote.git");
    fs.mkdirSync(remote);
    initGitRepo(remote, true);
    const repo = path.join(base, "repo");
    git(base, "clone", "-q", remote, repo);
    commitFile(repo, "README.md", "readme\n");
    commitFile(repo, "notes/old.md", "old\n");
    git(repo, "push", "-q", "-u", "origin", "main");
    return { remote, repo };
  }

  it("commits and pushes only the exported paths", () => {
    const { remote, repo } = backup();
    fs.mkdirSync(path.join(repo, ".omp"), { recursive: true });
    fs.writeFileSync(path.join(repo, ".omp", "a.txt"), "a\n");
    fs.writeFileSync(path.join(repo, ".omp", "b.txt"), "b\n");

    const result = gateway.commitAndPush(repo, [".omp/a.txt", ".omp/b.txt"], "sync: scoped");

    expect(result.success).toBe(true);
    expect(git(repo, "show", "--name-only", "--format=", "HEAD").split("\n").sort()).toEqual([
      ".omp/a.txt",
      ".omp/b.txt",
    ]);
    expect(git(remote, "rev-parse", "main")).toBe(git(repo, "rev-parse", "HEAD"));
    expect(git(repo, "status", "--porcelain")).toBe("");
  });

  it("commits a deleted exported path and a path that was already staged", () => {
    const { repo } = backup();
    fs.rmSync(path.join(repo, "notes", "old.md"));
    fs.writeFileSync(path.join(repo, "README.md"), "readme v2\n");
    git(repo, "add", "README.md");

    const result = gateway.commitAndPush(repo, ["notes/old.md", "README.md"]);

    expect(result.success).toBe(true);
    expect(git(repo, "show", "--name-status", "--format=", "HEAD").split("\n").sort()).toEqual([
      "D\tnotes/old.md",
      "M\tREADME.md",
    ]);
  });

  it("aborts before staging, committing, or pushing when unrelated staged, unstaged, or untracked paths exist", () => {
    const { remote, repo } = backup();
    fs.mkdirSync(path.join(repo, ".omp"), { recursive: true });
    fs.writeFileSync(path.join(repo, ".omp", "a.txt"), "a\n");
    fs.writeFileSync(path.join(repo, "README.md"), "unstaged edit\n");
    fs.writeFileSync(path.join(repo, "staged.md"), "s\n");
    git(repo, "add", "staged.md");
    fs.writeFileSync(path.join(repo, "scratch.tmp"), "u\n");
    const before = snapshotTree(repo);
    const remoteBefore = git(remote, "rev-parse", "main");

    const result = gateway.commitAndPush(repo, [".omp/a.txt"]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("GIT_DIRTY_UNRELATED");
      expect(result.unrelatedChanges).toEqual(["README.md", "scratch.tmp", "staged.md"]);
      for (const unrelated of ["README.md", "scratch.tmp", "staged.md"])
        expect(result.output).toContain(unrelated);
    }
    expect(snapshotTree(repo)).toEqual(before);
    expect(git(remote, "rev-parse", "main")).toBe(remoteBefore);
  });

  it("reports GIT_FAILED for a directory that is not a git repository", () => {
    const result = gateway.commitAndPush(tempDir(), ["a.txt"]);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("GIT_FAILED");
  });

  it("previews the exported and unrelated paths without changing anything", () => {
    const { repo } = backup();
    fs.writeFileSync(path.join(repo, "scratch.tmp"), "u\n");
    fs.mkdirSync(path.join(repo, ".omp"), { recursive: true });
    fs.writeFileSync(path.join(repo, ".omp", "a.txt"), "a\n");
    const before = snapshotTree(repo);

    const scope = gateway.previewPush(repo, [path.join(repo, ".omp", "a.txt")]);

    expect(scope).toEqual({ exportedPaths: [".omp/a.txt"], unrelatedChanges: ["scratch.tmp"] });
    expect(snapshotTree(repo)).toEqual(before);
    expect(gateway.previewPush(tempDir(), ["/nowhere/a.txt"])).toBeNull();
  });
});

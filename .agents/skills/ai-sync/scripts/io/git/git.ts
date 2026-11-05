import { execFileSync, execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
  GitPullResult,
  GitPushResult,
  GitPushScope,
  GitRemoteStatus,
  LocalGitState,
  PreviewOptions,
  RemoteIntegrationPreview,
  RevalidationResult,
} from "@/scripts/lib/git";
import type { GitPlan } from "@/scripts/lib/plan";
import { gitPullChecked } from "./checked-pull";
import { inspectLocalGitState } from "./local-state";
import { previewRemoteIntegration, revalidateGitState } from "./remote-preview";
import { runGit } from "./run-git";
import { gitCommitAndPush, previewGitPush } from "./scoped-push";

/** Git access for the backup repository; `io.git`. */
export const git = {
  /** HEAD commit of `repo`, or null when it is not a Git repository or has no commits. */
  headCommit(repo: string): string | null {
    if (!fs.existsSync(path.join(repo, ".git"))) return null;
    try {
      return (
        execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: repo,
          stdio: ["ignore", "pipe", "ignore"],
        })
          .toString()
          .trim() || null
      );
    } catch {
      return null;
    }
  },

  /** Subset of repo-relative `relPaths` ignored by the repository's own gitignore rules. */
  // Paths ignored by the repo's own .gitignore are intentionally excluded (e.g.
  // `vale sync`-downloaded packages): reuse git itself rather than reimplementing
  // gitignore glob semantics.
  ignoredPaths(repo: string, relPaths: string[]): Set<string> {
    const ignored = new Set<string>();
    if (relPaths.length === 0 || !fs.existsSync(path.join(repo, ".git"))) return ignored;
    const collect = (out: string): void => {
      for (const line of out.split("\n")) {
        if (line) ignored.add(line);
      }
    };
    try {
      collect(
        execSync("git check-ignore --stdin", {
          cwd: repo,
          input: relPaths.join("\n"),
          stdio: ["pipe", "pipe", "ignore"],
        }).toString(),
      );
    } catch (err: unknown) {
      // check-ignore exits 1 when nothing matches; only surface real failures.
      const stdout = (err as { stdout?: Buffer | string } | null)?.stdout;
      if (stdout) collect(stdout.toString());
    }
    return ignored;
  },

  /** Path of `repo` inside its Git working tree (`--show-prefix`, e.g. `sub/`), or null when not a Git tree. */
  repoPrefix(repo: string): string | null {
    const prefix = runGit(repo, ["rev-parse", "--show-prefix"]);
    return prefix.status === 0 ? prefix.stdout.trim() : null;
  },

  /** Contents of `relPath` (relative to `repo`) at HEAD, or null when HEAD has no such file. Read-only. */
  readHeadFile(repo: string, relPath: string): string | null {
    const shown = runGit(repo, ["show", `HEAD:./${relPath}`]);
    return shown.status === 0 ? shown.stdout : null;
  },

  /** Read-only simulation of integrating the remote; never writes to `repo`. */
  previewRemoteIntegration(repo: string, options?: PreviewOptions): RemoteIntegrationPreview {
    return previewRemoteIntegration(repo, options);
  },

  /** HEAD plus index/worktree cleanliness; throws when `repo` is not a Git repository. */
  inspectLocalState(repo: string, exportedPaths?: string[]): LocalGitState {
    return inspectLocalGitState(repo, exportedPaths);
  },

  /** Checks the saved pull plan still matches the remote and local Git state. */
  revalidate(repo: string, saved: GitPlan): RevalidationResult {
    return revalidateGitState(repo, saved);
  },

  /** Revalidates then integrates exactly the saved remote commit; leaves no merge in progress on failure. */
  pullChecked(repo: string, saved: GitPlan): GitPullResult {
    return gitPullChecked(repo, saved);
  },

  /** Git-relative export set for absolute `targetLocations` and pending unrelated changes; null when not Git. */
  previewPush(repo: string, targetLocations: string[]): GitPushScope | null {
    return previewGitPush(repo, targetLocations);
  },

  /** Stages, commits, and pushes only `exportedPaths`; aborts on unrelated changes. */
  commitAndPush(repo: string, exportedPaths: string[], commitMessage?: string): GitPushResult {
    return gitCommitAndPush(repo, exportedPaths, commitMessage);
  },

  /** Ahead/behind status of the current branch against its upstream. */
  remoteStatus(repoDir: string): GitRemoteStatus {
    const result: GitRemoteStatus = { isGit: false, message: "", ahead: 0, behind: 0 };
    if (!fs.existsSync(path.join(repoDir, ".git"))) return result;
    result.isGit = true;

    try {
      const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: repoDir, stdio: "pipe" })
        .toString()
        .trim();
      const tracking = execSync("git rev-parse --abbrev-ref @{upstream} 2>/dev/null || true", {
        cwd: repoDir,
        stdio: "pipe",
      })
        .toString()
        .trim();

      if (!tracking) {
        result.message = `Branch '${branch}' has no remote upstream configured.`;
        return result;
      }

      const counts = execSync(`git rev-list --left-right --count ${branch}...@{upstream}`, {
        cwd: repoDir,
        stdio: "pipe",
      })
        .toString()
        .trim();
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
  },
};

export type GitGateway = typeof git;

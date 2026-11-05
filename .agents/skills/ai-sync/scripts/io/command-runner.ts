import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface ShellOptions {
  /** `inherit` streams to the terminal; `pipe` captures and discards output. Defaults to `inherit`. */
  stdio?: "inherit" | "pipe";
  cwd?: string;
}

export interface MergeResult {
  success: boolean;
  /** True when `git merge-file` reported conflict blocks. */
  hasConflicts: boolean;
  /** Merged content, with conflict markers when `hasConflicts`. */
  content: string;
}

/** Shell, three-way merge, and diff subprocesses; `io.commandRunner`. */
export const commandRunner = {
  /** Runs a shell command string; throws when it exits non-zero. */
  runShell(command: string, options: ShellOptions = {}): void {
    execSync(command, {
      stdio: options.stdio === "pipe" ? ["ignore", "pipe", "pipe"] : "inherit",
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    });
  },

  /** Three-way merges `localFile` (ours) and `repoFile` (theirs) over an optional base via `git merge-file`. */
  mergeFiles(localFile: string, repoFile: string, baseFile?: string): MergeResult {
    const tmpMerged = path.join(
      os.tmpdir(),
      `ai-sync-merge-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`,
    );
    const tmpBase =
      baseFile && fs.existsSync(baseFile)
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
    } catch {
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

    return { success: true, hasConflicts, content };
  },

  /** `diff -u fileB fileA` output; "No files to compare." when neither exists, "" when it cannot run. */
  diff(fileA: string, fileB: string): string {
    if (!fs.existsSync(fileA) && !fs.existsSync(fileB)) return "No files to compare.";
    try {
      return execSync(`diff -u "${fileB}" "${fileA}" 2>&1 || true`, { stdio: "pipe" }).toString();
    } catch {
      return "";
    }
  },
};

export type CommandRunner = typeof commandRunner;

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

export interface CommandRunner {
  /** Runs a shell command string; throws when it exits non-zero. */
  runShell(command: string, options?: ShellOptions): void;
  /** Three-way merges `localFile` (ours) and `repoFile` (theirs) over an optional base via `git merge-file`. */
  mergeFiles(localFile: string, repoFile: string, baseFile?: string): MergeResult;
  /** `diff -u fileB fileA` output; "No files to compare." when neither exists, "" when it cannot run. */
  diff(fileA: string, fileB: string): string;
}

import { spawnSync } from "node:child_process";

export interface GitRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Read-only-friendly defaults: no prompts, no optional locks (so `git status` never refreshes the index). */
const GIT_ENV: NodeJS.ProcessEnv = {
  GIT_TERMINAL_PROMPT: "0",
  GIT_OPTIONAL_LOCKS: "0",
  LC_ALL: "C",
};

export function runGit(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): GitRun {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...GIT_ENV, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) return { status: null, stdout: "", stderr: result.error.message };
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

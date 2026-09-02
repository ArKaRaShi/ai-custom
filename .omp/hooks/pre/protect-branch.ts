import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

// Soft guard: confirms before modifying files or committing directly on protected branches.
// If the user accepts (Yes), the tool call proceeds.
// If the user declines (No), the tool is blocked and the agent returns to thinking to create a branch.

export const PROTECTED_BRANCHES: Record<string, true> = {
  main: true,
  master: true,
  develop: true,
  dev: true,
};

const MUTATING_TOOLS: Record<string, true> = {
  edit: true,
  write: true,
};

export async function getCurrentGitBranch(pi: HookAPI, cwd: string): Promise<string | null> {
  try {
    const res = await pi.exec("git", ["branch", "--show-current"], { cwd });
    const branch = (res.stdout ?? "").trim();
    return branch.length > 0 ? branch : null;
  } catch {
    return null;
  }
}

export function isProtectedBranch(branch: string | null): boolean {
  return branch ? PROTECTED_BRANCHES[branch] === true : false;
}

export function isGitCommitCommand(cmd: string): boolean {
  return /\bgit\s+commit\b/.test(cmd);
}

export default function protectBranch(pi: HookAPI): void {
  pi.on("tool_call", async (event, ctx) => {
    const isMutatingFile = MUTATING_TOOLS[event.toolName] === true;
    const isCommit = event.toolName === "bash" && isGitCommitCommand(String(event.input?.command ?? ""));

    if (!isMutatingFile && !isCommit) return;

    const branch = await getCurrentGitBranch(pi, ctx.cwd);
    if (!isProtectedBranch(branch)) return;

    if (ctx.hasUI) {
      const target = isCommit ? "run git commit" : `modify file (${event.input?.path ?? "unknown"})`;
      const ok = await ctx.ui.confirm(
        `⚠️ Protected Branch: ${branch}`,
        `The agent is about to ${target} directly on '${branch}'.\n\nAllow this operation?`,
      );

      if (ok) return; // User allowed -> tool proceeds
    }

    return {
      block: true,
      reason: `User declined direct changes on protected branch '${branch}'. Please create a feature or temporary branch first with 'git checkout -b <branch-name>'.`,
    };
  });
}

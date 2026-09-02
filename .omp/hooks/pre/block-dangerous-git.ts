import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

/**
 * Blocks destructive git commands before they execute.
 * Matches this repo's git-guardrails-claude-code skill, ported to an
 * omp-native pre-hook (tool_call, bash only).
 */

interface DangerousPattern {
  regex: RegExp;
  label: string;
}

// `-f`/`--force` alone are too broad (e.g. `mkdir -p`) to flag outside a git
// invocation, so callers gate on `/\bgit\b/` first; each pattern here already
// anchors to a specific git subcommand.
const DANGEROUS_GIT_PATTERNS: DangerousPattern[] = [
  { regex: /\bgit\s+push\b.*(--force|-f\b)/i, label: "git push --force" },
  { regex: /\bgit\s+reset\s+--hard\b/i, label: "git reset --hard" },
  { regex: /\bgit\s+clean\s+-[a-z]*f[a-z]*\b/i, label: "git clean -f/-fd" },
  { regex: /\bgit\s+branch\s+-D\b/, label: "git branch -D" },
  { regex: /\bgit\s+checkout\s+\.\s*(&&|;|$)/, label: "git checkout ." },
  { regex: /\bgit\s+restore\s+\.\s*(&&|;|$)/, label: "git restore ." },
  { regex: /\bgit\s+push\b(?!.*--force)(?!.*-f\b)/i, label: "git push" },
];

function isDangerousGitCommand(command: string): DangerousPattern | undefined {
  if (!/\bgit\b/.test(command)) return undefined;
  return DANGEROUS_GIT_PATTERNS.find((p) => p.regex.test(command));
}

export default function hook(pi: HookAPI): void {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const command = String(event.input.command ?? "");
    const match = isDangerousGitCommand(command);
    if (!match) return;

    if (ctx.hasUI) {
      const ok = await ctx.ui.confirm(
        "Dangerous git command",
        `Allow destructive operation?\n\n${command}\n\nMatched: ${match.label}`,
      );
      if (ok) return; // user explicitly approved, let it through
    }

    return {
      block: true,
      reason: `Blocked destructive git command (${match.label}): "${command}". Ask the user to run this manually if it's actually needed.`,
    };
  });
}

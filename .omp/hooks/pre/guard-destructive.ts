import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

// Comprehensive safety guard: confirms before commands that can destroy data,
// discard uncommitted work, or overwrite remote git history.
export interface DestructivePattern {
  re: RegExp;
  category: "git" | "filesystem" | "database" | "disk";
  label: string;
}

export const DESTRUCTIVE_PATTERNS: DestructivePattern[] = [
  // --- GIT DESTRUCTIVE OPERATIONS ---
  { re: /\bgit\s+push\b.*(?:--force|-f\b)/i, category: "git", label: "git push --force (remote history overwrite)" },
  { re: /\bgit\s+push\b/i, category: "git", label: "git push (remote branch update)" },
  { re: /\bgit\s+reset\s+--hard\b/i, category: "git", label: "git reset --hard (discards uncommitted work)" },
  { re: /\bgit\s+(?:restore|checkout)\s+\.\s*(?:&&|;|$)/i, category: "git", label: "git restore/checkout . (wipes all working changes)" },
  { re: /\bgit\s+clean\s+-[a-z]*[dfx][a-z]*\b/i, category: "git", label: "git clean (permanently deletes untracked files)" },
  { re: /\bgit\s+branch\s+-D\b/i, category: "git", label: "git branch -D (force delete unmerged branch)" },

  // --- FILESYSTEM & SYSTEM ---
  { re: /\brm\s+(?:-[a-z]*r[a-z]*\s+)+/i, category: "filesystem", label: "recursive directory deletion (rm -r)" },
  { re: /\bsudo\s+rm\b/i, category: "filesystem", label: "root-level delete (sudo rm)" },
  { re: /\bchmod\s+-R\s+777\s+\//i, category: "filesystem", label: "world-writable root chmod" },

  // --- DATABASE ---
  { re: /\b(?:drop\s+(?:table|database|schema)|truncate\s+(?:table)?)\b/i, category: "database", label: "SQL drop/truncate (data loss)" },

  // --- DISK & HARDWARE ---
  { re: /\bmkfs(?:\.\w+)?\b/i, category: "disk", label: "format filesystem (mkfs)" },
  { re: /\bdd\s+.*\bof=\/dev\//i, category: "disk", label: "raw disk write (dd)" },
  { re: />\s*\/dev\/(?:disk|sd|nvme)/i, category: "disk", label: "raw disk overwrite" },
];

export function findDestructiveCommand(command: string): DestructivePattern | undefined {
  return DESTRUCTIVE_PATTERNS.find((d) => d.re.test(command));
}

export default function guardDestructive(pi: HookAPI): void {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    const cmd = String(event.input.command ?? "").trim();
    const hit = findDestructiveCommand(cmd);
    if (!hit) return;

    if (!ctx.hasUI) {
      return { block: true, reason: `Blocked destructive command (${hit.label}): "${cmd}". Run manually if needed.` };
    }

    const ok = await ctx.ui.confirm(
      `⚠️ Destructive Command (${hit.category.toUpperCase()})`,
      `The agent wants to execute:\n\n${cmd}\n\nRisk: ${hit.label}\n\nDo you want to allow this?`,
    );

    if (!ok) {
      return { block: true, reason: `User declined execution of ${hit.label}: "${cmd}"` };
    }
  });
}

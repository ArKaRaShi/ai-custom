import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

// Confirm before commands that can destroy data or push irreversible changes.
// Add/remove regexes here to tune what counts as "destructive".
const DESTRUCTIVE: { re: RegExp; label: string }[] = [
  { re: /\brm\s+(-\w*r\w*\s+)+/, label: "recursive delete" },
  { re: /\bgit\s+push\b/, label: "git push (remote history change)" },
  { re: /\bgit\s+reset\s+--hard\b/, label: "git hard reset (discards work)" },
  { re: /\bgit\s+clean\s+-\w*[dfx]\w*/, label: "git clean (deletes untracked files)" },
  { re: /\b(drop\s+(table|database)|truncate\s+table)\b/i, label: "SQL drop/truncate" },
  { re: /\bmkfs(\.\w+)?\b/, label: "format filesystem" },
  { re: /\bdd\s+.*\bof=\/dev\//, label: "raw disk write" },
  { re: />\s*\/dev\/(disk|sd|nvme)/, label: "raw disk overwrite" },
  { re: /\bchmod\s+-R\s+777\s+\//, label: "world-writable root chmod" },
  { re: /\bsudo\s+rm\b/, label: "sudo delete" },
];

export default function (pi: HookAPI): void {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    const cmd = String(event.input.command ?? "");
    const hit = DESTRUCTIVE.find((d) => d.re.test(cmd));
    if (!hit) return;

    if (!ctx.hasUI) {
      return { block: true, reason: `blocked (no UI to confirm): ${hit.label} — ${cmd}` };
    }
    const ok = await ctx.ui.confirm(
      `Destructive command: ${hit.label}`,
      cmd,
    );
    if (!ok) return { block: true, reason: `user declined: ${hit.label}` };
  });
}

// ~/.omp/agent/hooks/post/smart-terminal-notifier.ts
// Native macOS audio and banner notification hook for Oh My Pi:
//   agent_start             -> Blop.mp3
//   agent_end               -> Ding.mp3 + native banner (when in background)
//   tool_approval_requested -> Bong.mp3 + native banner (always)
//   session_before_compact  -> Thump.mp3 + native banner
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

interface ToolApprovalEvent {
  toolName?: string;
}

const SOUNDS = {
  ping: `${process.env.HOME}/.omp/sounds/blop.mp3`,
  glass: `${process.env.HOME}/.omp/sounds/ding.mp3`,
  pop: `${process.env.HOME}/.omp/sounds/thump.mp3`,
  hero: `${process.env.HOME}/.omp/sounds/bong.mp3`,
} as const;

async function isTerminalActive(pi: HookAPI): Promise<boolean> {
  try {
    const res = await pi.exec("osascript", [
      "-e",
      'tell application "System Events" to get name of first application process whose frontmost is true',
    ]);
    const front = (res.stdout ?? "").trim().toLowerCase();
    return front.includes("iterm") || front.includes("terminal") || front.includes("ghostty") || front.includes("alacritty") || front.includes("kitty");
  } catch {
    return false;
  }
}

async function showNotification(pi: HookAPI, cwd: string, message: string, soundName?: string): Promise<void> {
  const dir = cwd.split("/").filter(Boolean).pop() ?? cwd;
  const escapedMessage = message.replace(/"/g, '\\"');
  const escapedDir = dir.replace(/"/g, '\\"');
  const soundClause = soundName ? `sound name "${soundName}"` : "";

  try {
    await pi.exec("osascript", [
      "-e",
      `display notification "${escapedMessage}" with title "π omp" subtitle "${escapedDir}" ${soundClause}`,
    ]);
  } catch {}
}

export default function smartTerminalNotifier(pi: HookAPI): void {
  pi.on("agent_start", () => {
    void pi.exec("afplay", [SOUNDS.ping]).catch(() => {});
  });

  pi.on("agent_end", async (_event, ctx) => {
    const terminalActive = await isTerminalActive(pi);
    if (!terminalActive) {
      void Promise.all([
        pi.exec("afplay", [SOUNDS.glass]).catch(() => {}),
        showNotification(pi, ctx.cwd, "Session finished"),
      ]);
    } else {
      void pi.exec("afplay", [SOUNDS.glass]).catch(() => {});
    }
  });

  pi.on("tool_approval_requested", async (event: unknown, ctx) => {
    const toolEvent = event && typeof event === "object" && "toolName" in event ? (event as ToolApprovalEvent) : undefined;
    const toolName = toolEvent?.toolName ? `Approval: ${toolEvent.toolName}` : "Approval required";
    void Promise.all([
      pi.exec("afplay", [SOUNDS.hero]).catch(() => {}),
      showNotification(pi, ctx.cwd, toolName),
    ]);
  });

  pi.on("session_before_compact", async (_event, ctx) => {
    const terminalActive = await isTerminalActive(pi);
    if (!terminalActive) {
      void Promise.all([
        pi.exec("afplay", [SOUNDS.pop]).catch(() => {}),
        showNotification(pi, ctx.cwd, "Context compacting..."),
      ]);
    } else {
      void pi.exec("afplay", [SOUNDS.pop]).catch(() => {});
    }
  });
}

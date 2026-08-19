// ~/.omp/agent/hooks/post/notify-sound.ts
// Mirrors the Claude Code sound/notification setup from ~/.claude/settings.json:
//   UserPromptSubmit -> Ping.aiff              (agent_start here)
//   Stop             -> Glass.aiff + notify     (agent_end here)
//   PreCompact       -> Pop.aiff + notify       (session_before_compact here)
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

const SOUNDS = {
  ping: "/System/Library/Sounds/Ping.aiff",
  glass: "/System/Library/Sounds/Glass.aiff",
  pop: "/System/Library/Sounds/Pop.aiff",
} as const;

async function playSound(pi: HookAPI, sound: string): Promise<void> {
  try {
    await pi.exec("afplay", [sound]);
  } catch {}
}

async function notify(pi: HookAPI, cwd: string, message: string): Promise<void> {
  const dir = cwd.split("/").filter(Boolean).pop() ?? cwd;
  try {
    await pi.exec("terminal-notifier", [
      "-title", "π omp",
      "-subtitle", dir,
      "-message", message,
      "-group", `omp-${cwd}`,
      "-execute", "osascript -e 'tell application \"iTerm\" to activate'",
    ]);
  } catch {}
}

export default function notifySound(pi: HookAPI): void {
  pi.on("agent_start", () => {
    void playSound(pi, SOUNDS.ping);
  });
  pi.on("agent_end", (_event, ctx) => {
    void Promise.all([playSound(pi, SOUNDS.glass), notify(pi, ctx.cwd, "Session finished")]);
  });
  pi.on("session_before_compact", (_event, ctx) => {
    void Promise.all([playSound(pi, SOUNDS.pop), notify(pi, ctx.cwd, "Context compacting...")]);
  });
}

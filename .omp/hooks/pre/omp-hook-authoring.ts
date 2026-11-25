import * as path from "path";
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";
import { advisory, error, resetOnSessionChange, sessionOnce, type HookMeta } from "../shared/verdict";

export const HOOK_META = {
  id: "omp-hook-authoring",
  category: "ERROR",
  events: ["tool_call", "session_start", "session_clear"],
  standards: [".agents/standards/authoring-hooks.md"],
} satisfies HookMeta;

const HOOK_FILE = /(^|\/)\.omp\/(agent\/)?hooks\/(pre|post)\/[^/]+\.ts$/;
const RAW_BLOCK = /block\s*:\s*true/;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export default function ompHookAuthoring(pi: HookAPI): void {
  const once = sessionOnce();
  resetOnSessionChange(pi, once);

  pi.on("tool_call", async (event) => {
    const record = asRecord(event);
    const toolName = String(record.toolName ?? "");
    if (toolName !== "write" && toolName !== "edit" && toolName !== "ast_edit") return;

    const input = asRecord(record.input);
    const file = String(input.path ?? input.file_path ?? "");
    if (!HOOK_FILE.test(file)) return;

    const name = path.basename(file);
    const text = String(input.content ?? input.new_string ?? "");

    if (!text.includes("HOOK_META")) {
      return error(
        HOOK_META,
        `hook ${name} declares no HOOK_META`,
        `add "export const HOOK_META = { id, category, events, standards } satisfies HookMeta" from ../shared/verdict`,
      );
    }
    if (RAW_BLOCK.test(text)) {
      return error(HOOK_META, `hook ${name} builds a raw blocking return`, "call error() or block() from ../shared/verdict instead");
    }
    if (!once.take(file)) return;
    return advisory(
      HOOK_META,
      `hook ${name} follows the standard; read ${path.join(process.env.HOME ?? "~", ".agents/standards/authoring-hooks.md")} before wiring events`,
    );
  });
}

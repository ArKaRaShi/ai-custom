import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";
import { resetOnSessionChange, sessionOnce, warn, type HookMeta } from "../shared/verdict";

export const HOOK_META = {
  id: "agents-index",
  category: "WARN",
  events: ["tool_result", "session_start", "session_clear"],
  standards: [".agents/standards/authoring-standards.md"],
} satisfies HookMeta;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** Where the row for `relative` belongs, and what it must contain. Root level only. */
function indexTarget(relative: string): { index: string; needle: string } | undefined {
  const parts = relative.split("/").filter(Boolean);
  if (parts[0] === "skills") return undefined;
  if (parts.length === 1) {
    if (parts[0] === "README.md") return undefined;
    return { index: ".agents/README.md", needle: parts[0] };
  }
  if (parts.length !== 2 || parts[0] !== "standards") return undefined;
  if (parts[1] === "README.md") return { index: ".agents/README.md", needle: "standards/" };
  return { index: ".agents/standards/README.md", needle: parts[1] };
}

/** The warning for an unlisted entry, or undefined when the index already names it. */
export function indexFinding(home: string, file: string): string | undefined {
  const absolute = file.startsWith("~/") ? path.join(home, file.slice(2)) : file;
  const prefix = `${path.join(home, ".agents")}/`;
  if (!absolute.startsWith(prefix)) return undefined;
  const relative = absolute.slice(prefix.length);
  const target = indexTarget(relative);
  if (!target) return undefined;
  const indexPath = path.join(home, target.index);
  if (!fs.existsSync(indexPath)) {
    return `${target.index} does not exist; add it so the next agent can find ${relative}`;
  }
  const index = fs.readFileSync(indexPath, "utf8");
  if (index.includes(target.needle)) return undefined;
  return `${target.index} does not list ${target.needle}; add a row so the next agent finds ${relative}`;
}

export default function agentsIndex(pi: HookAPI): void {
  const once = sessionOnce();
  resetOnSessionChange(pi, once);

  pi.on("tool_result", async (event) => {
    const record = asRecord(event);
    const toolName = String(record.toolName ?? "");
    if (toolName !== "write" && toolName !== "edit") return;
    if (record.isError === true) return;
    const file = String(asRecord(record.input).path ?? "");
    const finding = indexFinding(os.homedir(), file);
    if (!finding) return;
    if (!once.take(finding)) return;
    return warn(HOOK_META, `${finding}. Fix: add the row to the index named above`);
  });
}

import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as readline from "readline";

const LOG_FILE = path.join(os.homedir(), ".omp", "agent", "turn-metrics.log");

let agentStartTime = 0;
let lastOut = 0;
let lastIn = 0;

export interface UsageSummary {
  outputTokens: number;
  inputTokens: number;
}

export async function getTotalUsage(sessionFile: string): Promise<UsageSummary> {
  const sum: UsageSummary = { outputTokens: 0, inputTokens: 0 };
  if (!fs.existsSync(sessionFile)) return sum;

  const rl = readline.createInterface({ input: fs.createReadStream(sessionFile) });
  for await (const line of rl) {
    if (!line) continue;
    try {
      const rec = JSON.parse(line);
      if (rec.type === "message" && rec.message?.role === "assistant" && rec.message?.usage) {
        sum.outputTokens += Number(rec.message.usage.output) || 0;
        sum.inputTokens += Number(rec.message.usage.input) || 0;
      }
    } catch {}
  }
  return sum;
}

export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}
export function isSubagent(ctx?: ExtensionContext): boolean {
  if (!ctx) return false;
  if ((ctx as Record<string, unknown>).isSubagent === true) return true;
  const sessionFile = ctx?.sessionManager?.getSessionFile?.() || "";
  if (!sessionFile) return false;
  const baseName = sessionFile.split("/").pop() || "";
  // Root session files start with ISO timestamp (e.g. 2026-08-19T...)
  // Subagent session files are named after the agent (e.g. TestSonic.jsonl)
  return !/^\d{4}-\d{2}-\d{2}T/.test(baseName);
}

export interface ExtensionContext {
  sessionManager?: {
    getSessionFile(): string;
  };
  hasUI?: boolean;
  ui?: {
    notify(msg: string, level?: "info" | "warning" | "error"): void;
  };
}

export default function (pi: ExtensionAPI) {
  pi.on("agent_start", async (_event: unknown, ctx: ExtensionContext) => {
    agentStartTime = Date.now();
    try {
      const sessionFile = ctx?.sessionManager?.getSessionFile();
      if (sessionFile) {
        const u = await getTotalUsage(sessionFile);
        lastOut = u.outputTokens;
        lastIn = u.inputTokens;
      }
    } catch {}
  });

  pi.on("agent_end", async (_event: unknown, ctx: ExtensionContext) => {
    const dur = agentStartTime > 0 ? ((Date.now() - agentStartTime) / 1000).toFixed(1) : "0.0";
    let dOut = 0;
    let dIn = 0;
    try {
      const sessionFile = ctx?.sessionManager?.getSessionFile();
      if (sessionFile) {
        const u = await getTotalUsage(sessionFile);
        dOut = Math.max(0, u.outputTokens - lastOut);
        dIn = Math.max(0, u.inputTokens - lastIn);
        lastOut = u.outputTokens;
        lastIn = u.inputTokens;
      }
    } catch {}

    const msg = `${dur}s · ${formatTokens(dOut)} output · ${formatTokens(dIn)} input`;

    if (ctx?.hasUI && ctx?.ui?.notify) {
      ctx.ui.notify(msg, "info");
    } else {
      console.log(msg);
    }

    try {
      fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
    } catch {}

    agentStartTime = 0;
  });
}

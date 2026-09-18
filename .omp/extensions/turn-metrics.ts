import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const LOG_FILE = path.join(os.homedir(), ".omp", "agent", "turn-metrics.log");

let agentStartTime = 0;
let lastOut = 0;
let lastIn = 0;
let lastCacheRead = 0;
let lastThinking = 0;
let lastCostTotal = 0;
let lastCostSaved = 0;

export interface TurnMetricsDetails {
  ttftMs?: number;
  dThinking?: number;
  costTotal?: number;
  costSaved?: number;
}

export interface UsageSummary {
  outputTokens: number;
  inputTokens: number;
  cacheReadTokens: number;
  thinkingTokens: number;
  costTotal: number;
  costSaved: number;
  lastTtftMs: number;
}

export function formatTtft(ms: number): string {
  const sec = ms / 1000;
  if (sec < 0.1) return "<0.1s ttft";
  return `${sec.toFixed(1)}s ttft`;
}

export function formatCost(amount: number): string {
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  return `$${amount.toFixed(3)}`;
}

export function formatSaved(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/**
 * Parses assistant message usage from the session JSONL file.
 * Reads efficiently using Bun.file or Node fs.
 */
export async function getTotalUsage(sessionFile: string): Promise<UsageSummary> {
  const sum: UsageSummary = {
    outputTokens: 0,
    inputTokens: 0,
    cacheReadTokens: 0,
    thinkingTokens: 0,
    costTotal: 0,
    costSaved: 0,
    lastTtftMs: 0,
  };
  if (!fs.existsSync(sessionFile)) return sum;

  try {
    const content =
      typeof Bun !== "undefined"
        ? await Bun.file(sessionFile).text()
        : fs.readFileSync(sessionFile, "utf-8");

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const rec = JSON.parse(line);
        if (rec.type === "message" && rec.message?.role === "assistant") {
          const usage = rec.message.usage || {};
          const out = Number(usage.output) || 0;
          const inp = Number(usage.input) || 0;
          const cache = Number(usage.cacheRead) || 0;

          sum.outputTokens += out;
          sum.inputTokens += inp;
          sum.cacheReadTokens += cache;

          if (typeof rec.message.ttft === "number" && rec.message.ttft > 0) {
            sum.lastTtftMs = rec.message.ttft;
          } else if (typeof rec.ttft === "number" && rec.ttft > 0) {
            sum.lastTtftMs = rec.ttft;
          }

          const directThinking =
            Number(
              usage.thinking ||
                usage.reasoning ||
                usage.thoughtTokens ||
                usage.details?.reasoningTokens ||
                usage.reasoning_tokens
            ) || 0;

          if (directThinking > 0) {
            sum.thinkingTokens += directThinking;
          } else if (Array.isArray(rec.message.content)) {
            let thinkChars = 0;
            let actChars = 0;
            for (const block of rec.message.content) {
              if (!block || typeof block !== "object") continue;
              if (block.type === "thinking") {
                thinkChars += (block.thinking || "").length;
              } else {
                const text = block.text || "";
                const name = block.name || "";
                const args = block.arguments ? JSON.stringify(block.arguments) : "";
                actChars += text.length + name.length + args.length;
              }
            }
            const totalChars = thinkChars + actChars;
            if (totalChars > 0 && thinkChars > 0) {
              const estThinking = Math.round(out * (thinkChars / totalChars));
              sum.thinkingTokens += estThinking;
            }
          }

          if (usage.cost && typeof usage.cost === "object") {
            const turnCost = Number(usage.cost.total) || 0;
            sum.costTotal += turnCost;

            const cacheReadCost = Number(usage.cost.cacheRead) || 0;
            const inputCost = Number(usage.cost.input) || 0;
            if (cache > 0) {
              let unitInputRate = 0;
              if (inp > 0 && inputCost > 0) {
                unitInputRate = inputCost / inp;
              } else if (cacheReadCost > 0) {
                unitInputRate = (cacheReadCost / cache) * 10;
              }
              if (unitInputRate > 0) {
                const uncachedInputCost = cache * unitInputRate;
                const saved = Math.max(0, uncachedInputCost - cacheReadCost);
                sum.costSaved += saved;
              }
            }
          }
        }
      } catch {}
    }
  } catch {}

  return sum;
}

export function formatTurnMetrics(
  dur: string,
  dOut: number,
  dIn: number,
  dCache: number,
  details?: TurnMetricsDetails
): string {
  const durLabel = dur.endsWith("s") || dur.startsWith("⊘") ? dur : `${dur}s`;
  const timePart =
    details?.ttftMs && details.ttftMs > 0
      ? ` ${durLabel} (${formatTtft(details.ttftMs)})`
      : ` ${durLabel}`;

  const dThinking = details?.dThinking || 0;
  const dAct = Math.max(0, dOut - dThinking);

  let outPart: string;
  if (dThinking > 0 && dAct > 0) {
    outPart = `󰧑 ${formatTokens(dThinking)} think · 󰆍 ${formatTokens(dAct)} act (${formatTokens(dOut)} out)`;
  } else if (dThinking > 0) {
    outPart = `󰧑 ${formatTokens(dThinking)} think (${formatTokens(dOut)} out)`;
  } else {
    outPart = `󰆍 ${formatTokens(dOut)} out`;
  }

  const totalIn = dIn + dCache;
  let inPart: string;
  if (dCache > 0) {
    const pct = ((dCache / totalIn) * 100).toFixed(1).replace(/\.0$/, "");
    inPart = `󱐋 ${pct}% (${formatTokens(dCache)} cached · ${formatTokens(dIn)} new)`;
  } else {
    inPart = `󱐋 ${formatTokens(dIn)} in`;
  }

  const parts = [timePart, outPart, inPart];

  const costTotal = details?.costTotal || 0;
  const costSaved = details?.costSaved || 0;
  if (costTotal > 0) {
    if (costSaved > 0) {
      parts.push(`󰠓 ${formatCost(costTotal)} (󰚰 ${formatSaved(costSaved)})`);
    } else {
      parts.push(`󰠓 ${formatCost(costTotal)}`);
    }
  }

  return parts.join(" · ");
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    const val = (n / 1_000_000).toFixed(1);
    return `${val.replace(/\.0$/, "")}m`;
  }
  if (n >= 1000) {
    const val = (n / 1000).toFixed(1);
    return `${val.replace(/\.0$/, "")}k`;
  }
  return `${n}`;
}

export interface ExtensionContext {
  isSubagent?: boolean;
  sessionManager?: {
    getSessionFile(): string;
  };
  hasUI?: boolean;
  ui?: {
    notify(msg: string, level?: "info" | "warning" | "error"): void;
  };
}

export function isSubagent(ctx?: ExtensionContext): boolean {
  if (!ctx) return false;
  if (ctx.isSubagent === true) return true;
  const sessionFile = ctx.sessionManager?.getSessionFile?.() || "";
  if (!sessionFile) return false;
  const baseName = sessionFile.split("/").pop() || "";
  // Root session files start with ISO timestamp (e.g. 2026-08-19T...)
  // Subagent session files are named after the agent (e.g. TestSonic.jsonl)
  return !/^\d{4}-\d{2}-\d{2}T/.test(baseName);
}

export default function (pi: ExtensionAPI) {
  pi.on("agent_start", async (_event: unknown, ctx: ExtensionContext) => {
    if (isSubagent(ctx)) return;
    agentStartTime = Date.now();
    try {
      const sessionFile = ctx?.sessionManager?.getSessionFile();
      if (sessionFile) {
        const u = await getTotalUsage(sessionFile);
        lastOut = u.outputTokens;
        lastIn = u.inputTokens;
        lastCacheRead = u.cacheReadTokens;
        lastThinking = u.thinkingTokens;
        lastCostTotal = u.costTotal;
        lastCostSaved = u.costSaved;
      }
    } catch {}
  });

  pi.on("agent_end", async (_event: unknown, ctx: ExtensionContext) => {
    if (isSubagent(ctx)) return;
    let dur: string;
    if (agentStartTime <= 0) {
      dur = "⊘ aborted";
    } else {
      const elapsed = (Date.now() - agentStartTime) / 1000;
      dur = elapsed < 0.05 ? "<0.1s" : `${elapsed.toFixed(1)}s`;
    }
    let dOut = 0;
    let dIn = 0;
    let dCache = 0;
    let dThinking = 0;
    let dCost = 0;
    let dSaved = 0;
    let ttftMs = 0;

    try {
      const sessionFile = ctx?.sessionManager?.getSessionFile();
      if (sessionFile) {
        const u = await getTotalUsage(sessionFile);
        dOut = Math.max(0, u.outputTokens - lastOut);
        dIn = Math.max(0, u.inputTokens - lastIn);
        dCache = Math.max(0, u.cacheReadTokens - lastCacheRead);
        dThinking = Math.max(0, u.thinkingTokens - lastThinking);
        dCost = Math.max(0, u.costTotal - lastCostTotal);
        dSaved = Math.max(0, u.costSaved - lastCostSaved);
        ttftMs = u.lastTtftMs;

        lastOut = u.outputTokens;
        lastIn = u.inputTokens;
        lastCacheRead = u.cacheReadTokens;
        lastThinking = u.thinkingTokens;
        lastCostTotal = u.costTotal;
        lastCostSaved = u.costSaved;
      }
    } catch {}

    const msg = formatTurnMetrics(dur, dOut, dIn, dCache, {
      ttftMs,
      dThinking,
      costTotal: dCost,
      costSaved: dSaved,
    });

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

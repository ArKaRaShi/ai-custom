import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { Component } from "@oh-my-pi/pi-tui";
import { truncateToWidth } from "@oh-my-pi/pi-tui";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as readline from "readline";

// Measured avg output-token reduction for caveman "full" mode
// (JuliusBrussee/caveman benchmarks/results, 10-prompt suite, sonnet-4).
// Whole-session estimate — no per-mode attribution (omp has no mode-flag
// log; caveman full is this environment's standing default per AGENTS.md).
const COMPRESSION_RATIO = 0.65;

// Append-only, one snapshot per (re-)run — latest-per-session wins at read
// time (aggregateLifetime), so re-running /caveman-stats mid-session never
// double-counts. Best-effort like every other file IO here: single-user
// personal dir, not a multi-tenant install, so no symlink-defense/atomic-
// rename dance (that's solving a threat model this file doesn't have).
const HISTORY_PATH = path.join(os.homedir(), ".omp", "agent", ".caveman-history.jsonl");

interface SessionUsage {
  turns: number;
  outputTokens: number;
  cacheReadTokens: number;
  inputTokens: number;
  realCostUsd: number;
  outputCostUsd: number;
}

interface Savings {
  estSavedTokens: number;
  estSavedUsd: number;
}

interface HistorySnapshot {
  ts: number;
  sessionId: string;
  outputTokens: number;
  estSavedTokens: number;
  estSavedUsd: number;
}

interface LifetimeAggregate {
  sessions: number;
  outputTokens: number;
  estSavedTokens: number;
  estSavedUsd: number;
}

export async function collectUsage(sessionFile: string): Promise<SessionUsage> {
  const usage: SessionUsage = {
    turns: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    inputTokens: 0,
    realCostUsd: 0,
    outputCostUsd: 0,
  };
  if (!fs.existsSync(sessionFile)) return usage;

  const rl = readline.createInterface({ input: fs.createReadStream(sessionFile) });
  for await (const line of rl) {
    if (!line) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    if (rec.type !== "message") continue;
    const message = rec.message as Record<string, unknown> | undefined;
    if (!message || message.role !== "assistant") continue;
    const msgUsage = message.usage as Record<string, unknown> | undefined;
    if (!msgUsage) continue;
    const cost = msgUsage.cost as Record<string, unknown> | undefined;
    usage.outputTokens += Number(msgUsage.output) || 0;
    usage.cacheReadTokens += Number(msgUsage.cacheRead) || 0;
    usage.inputTokens += Number(msgUsage.input) || 0;
    usage.realCostUsd += Number(cost?.total) || 0;
    usage.outputCostUsd += Number(cost?.output) || 0;
    usage.turns++;
  }
  return usage;
}

// Savings estimate: verbose = compressed / (1 - ratio); saved = verbose - compressed.
// Same formula as upstream caveman-stats.js deriveSavings(). USD rate is derived
// from this session's own real output cost (usage.cost.output/output tokens)
// instead of a static per-model price table, so it never goes stale.
export function deriveSavings(usage: Pick<SessionUsage, "outputTokens" | "outputCostUsd">): Savings {
  const estSavedTokens = Math.round(usage.outputTokens / (1 - COMPRESSION_RATIO)) - usage.outputTokens;
  const outputTokenRate = usage.outputTokens > 0 ? usage.outputCostUsd / usage.outputTokens : 0;
  return { estSavedTokens, estSavedUsd: estSavedTokens * outputTokenRate };
}

function humanizeTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(Math.round(n));
}

function formatUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

const SEP = "──────────────────────────────────";

function row(label: string, value: string): string {
  return ` ${label.padEnd(20)}${value}`;
}

export function formatCondensed(usage: SessionUsage, lifetime: LifetimeAggregate): string {
  if (usage.turns === 0) {
    return "caveman-stats: no assistant turns recorded yet this session.";
  }
  const { estSavedTokens, estSavedUsd } = deriveSavings(usage);
  const lines = [
    `🪨 ${usage.turns} turn${usage.turns === 1 ? "" : "s"} · ${humanizeTokens(usage.outputTokens)} output tokens · $${usage.realCostUsd.toFixed(2)} — saved ~${humanizeTokens(estSavedTokens)} tokens (~${formatUsd(estSavedUsd)})`,
  ];
  if (lifetime.sessions > 0) {
    lines.push(
      `🪨 lifetime: ${humanizeTokens(lifetime.estSavedTokens)} tokens saved (~${formatUsd(lifetime.estSavedUsd)}) across ${lifetime.sessions} session${lifetime.sessions === 1 ? "" : "s"}`,
    );
  }
  return lines.join("\n");
}

export function formatFull(usage: SessionUsage, lifetime: LifetimeAggregate): string {
  if (usage.turns === 0) {
    return "caveman-stats: no assistant turns recorded yet this session.";
  }
  const { estSavedTokens, estSavedUsd } = deriveSavings(usage);

  const lines = [
    SEP,
    " Caveman Stats",
    SEP,
    row("Turns:", String(usage.turns)),
    row("Output tokens:", humanizeTokens(usage.outputTokens)),
    row("Cache-read tokens:", humanizeTokens(usage.cacheReadTokens)),
    row("Session cost:", `$${usage.realCostUsd.toFixed(2)}`),
    SEP,
    row("Without caveman:", `${humanizeTokens(usage.outputTokens + estSavedTokens)} tokens (est.)`),
    row("Est. saved:", `${humanizeTokens(estSavedTokens)} tokens (~${formatUsd(estSavedUsd)})`),
  ];
  if (lifetime.sessions > 0) {
    lines.push(
      SEP,
      row(
        "Lifetime without:",
        `${humanizeTokens(lifetime.outputTokens + lifetime.estSavedTokens)} tokens (est.) across ${lifetime.sessions} session${lifetime.sessions === 1 ? "" : "s"}`,
      ),
      row("Lifetime saved:", `${humanizeTokens(lifetime.estSavedTokens)} tokens (~${formatUsd(lifetime.estSavedUsd)})`),
    );
  }
  lines.push(
    SEP,
    " basis: measured 65% avg output-token reduction, full mode. Session-wide estimate, not per-mode attributed.",
  );
  return lines.join("\n");
}

// Best-effort append. Silent-fails on any filesystem error — the history
// file is a nice-to-have, never a reason to break the stats command.
export function appendHistorySnapshot(sessionFile: string, usage: SessionUsage): void {
  if (usage.turns === 0) return;
  const { estSavedTokens, estSavedUsd } = deriveSavings(usage);
  const snapshot: HistorySnapshot = {
    ts: Date.now(),
    sessionId: path.basename(sessionFile, ".jsonl"),
    outputTokens: usage.outputTokens,
    estSavedTokens,
    estSavedUsd,
  };
  try {
    fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
    fs.appendFileSync(HISTORY_PATH, JSON.stringify(snapshot) + "\n");
  } catch {
    // best-effort
  }
}

// Latest snapshot per sessionId wins (re-runs within one session must not
// double-count); then sum across sessions. Mirrors upstream aggregateHistory.
export function aggregateLifetime(historyPath: string): LifetimeAggregate {
  let lines: string[] = [];
  try {
    lines = fs.readFileSync(historyPath, "utf8").split("\n").filter(Boolean);
  } catch {
    return { sessions: 0, outputTokens: 0, estSavedTokens: 0, estSavedUsd: 0 };
  }

  const latestPerSession = new Map<string, HistorySnapshot>();
  for (const line of lines) {
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Partial<HistorySnapshot>;
    if (typeof rec.sessionId !== "string" || typeof rec.ts !== "number") continue;
    const prev = latestPerSession.get(rec.sessionId);
    if (!prev || rec.ts >= prev.ts) {
      latestPerSession.set(rec.sessionId, {
        ts: rec.ts,
        sessionId: rec.sessionId,
        outputTokens: Number(rec.outputTokens) || 0,
        estSavedTokens: Number(rec.estSavedTokens) || 0,
        estSavedUsd: Number(rec.estSavedUsd) || 0,
      });
    }
  }

  const agg: LifetimeAggregate = { sessions: latestPerSession.size, outputTokens: 0, estSavedTokens: 0, estSavedUsd: 0 };
  for (const snap of latestPerSession.values()) {
    agg.outputTokens += snap.outputTokens;
    agg.estSavedTokens += snap.estSavedTokens;
    agg.estSavedUsd += snap.estSavedUsd;
  }
  return agg;
}

interface FgTheme {
  fg(color: string, text: string): string;
}

// Colored variant of formatFull's box, for the interactive `full` widget.
// Savings figures highlighted in "success" (green); box drawn with theme
// tokens instead of plain characters.
function buildColoredBoxLines(usage: SessionUsage, lifetime: LifetimeAggregate, theme: FgTheme): string[] {
  if (usage.turns === 0) {
    return [theme.fg("muted", "caveman-stats: no assistant turns recorded yet this session.")];
  }
  const { estSavedTokens, estSavedUsd } = deriveSavings(usage);
  const sepLine = theme.fg("border", SEP);
  const coloredRow = (label: string, value: string, valueColor?: string): string =>
    ` ${theme.fg("muted", label.padEnd(20))}${valueColor ? theme.fg(valueColor, value) : value}`;

  const lines = [
    sepLine,
    theme.fg("accent", " Caveman Stats"),
    sepLine,
    coloredRow("Turns:", String(usage.turns)),
    coloredRow("Output tokens:", humanizeTokens(usage.outputTokens)),
    coloredRow("Cache-read tokens:", humanizeTokens(usage.cacheReadTokens)),
    coloredRow("Session cost:", `$${usage.realCostUsd.toFixed(2)}`),
    sepLine,
    coloredRow("Without caveman:", `${humanizeTokens(usage.outputTokens + estSavedTokens)} tokens (est.)`, "muted"),
    coloredRow("Est. saved:", `${humanizeTokens(estSavedTokens)} tokens (~${formatUsd(estSavedUsd)})`, "success"),
  ];
  if (lifetime.sessions > 0) {
    lines.push(
      sepLine,
      coloredRow(
        "Lifetime without:",
        `${humanizeTokens(lifetime.outputTokens + lifetime.estSavedTokens)} tokens (est.) across ${lifetime.sessions} session${lifetime.sessions === 1 ? "" : "s"}`,
        "muted",
      ),
      coloredRow(
        "Lifetime saved:",
        `${humanizeTokens(lifetime.estSavedTokens)} tokens (~${formatUsd(lifetime.estSavedUsd)})`,
        "success",
      ),
    );
  }
  lines.push(
    sepLine,
    theme.fg(
      "dim",
      " basis: measured 65% avg output-token reduction, full mode. Session-wide estimate, not per-mode attributed.",
    ),
    theme.fg("dim", " (any key to close)"),
  );
  return lines;
}

// Static content, memoized per render width (component contract: return the
// same array reference when unchanged). Dismisses on any keypress.
class StatsView implements Component {
  private readonly raw: readonly string[];
  private cache: { width: number; lines: readonly string[] } | null = null;
  private readonly onDismiss: () => void;

  constructor(lines: readonly string[], onDismiss: () => void) {
    this.raw = lines;
    this.onDismiss = onDismiss;
  }

  render(width: number): readonly string[] {
    if (this.cache && this.cache.width === width) return this.cache.lines;
    const lines = this.raw.map((l) => truncateToWidth(l, width));
    this.cache = { width, lines };
    return lines;
  }

  handleInput(): void {
    this.onDismiss();
  }
}

async function computeStats(
  ctx: { sessionManager: { getSessionFile(): string } },
): Promise<{ usage: SessionUsage; lifetime: LifetimeAggregate }> {
  const sessionFile = ctx.sessionManager.getSessionFile();
  const usage = await collectUsage(sessionFile);
  appendHistorySnapshot(sessionFile, usage);
  return { usage, lifetime: aggregateLifetime(HISTORY_PATH) };
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("caveman-stats", {
    description: "Show real token usage and estimated caveman savings. Add 'full' for a detailed breakdown.",
    handler: async (args, ctx) => {
      const full = args.trim().toLowerCase() === "full";
      const { usage, lifetime } = await computeStats(ctx);

      if (full && ctx.hasUI) {
        await ctx.ui.custom<undefined>(
          (_tui, theme, _keybindings, done) => {
            const lines = buildColoredBoxLines(usage, lifetime, theme);
            return new StatsView(lines, () => done(undefined));
          },
          { overlay: true },
        );
        return;
      }

      const text = full ? formatFull(usage, lifetime) : formatCondensed(usage, lifetime);
      if (ctx.hasUI) {
        ctx.ui.notify(text, "info");
      } else {
        console.log(text);
      }
    },
  });

  // Auto-capture on shutdown too, so lifetime totals don't depend on the
  // user remembering to run /caveman-stats before ending a session.
  pi.on("session_shutdown", async (_event, ctx) => {
    try {
      const sessionFile = ctx.sessionManager.getSessionFile();
      const usage = await collectUsage(sessionFile);
      appendHistorySnapshot(sessionFile, usage);
    } catch {
      // best-effort
    }
  });
}

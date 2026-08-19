import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as readline from "readline";

const execAsync = promisify(exec);

export interface QuotaLimit {
  id?: string;
  label: string;
  window?: {
    label: string;
    resetsAt: number;
  };
  amount: {
    usedFraction: number;
    used: number;
  };
}

export interface ProviderReport {
  provider: string;
  limits?: QuotaLimit[];
}

export interface UsagePayload {
  reports?: ProviderReport[];
}

let cachedUsage: UsagePayload | null = null;
let lastFetchTime = 0;
let lastCtx: ExtensionContext | null = null;

export async function fetchUsage(forceRefresh = false): Promise<UsagePayload | null> {
  const now = Date.now();
  // 10s cooldown between fetches
  if (!forceRefresh && cachedUsage && now - lastFetchTime < 10_000) {
    return cachedUsage;
  }

  try {
    if (forceRefresh) {
      try {
        await execAsync("omp usage invalidate");
      } catch {}
    }
    const { stdout } = await execAsync("omp usage --json");
    cachedUsage = JSON.parse(stdout) as UsagePayload;
    lastFetchTime = now;
    return cachedUsage;
  } catch {
    return cachedUsage;
  }
}

export function formatReset(resetsAtMs?: number, now = Date.now()): string {
  if (!resetsAtMs) return "";
  const diffMs = resetsAtMs - now;
  if (diffMs <= 0) return "0m";
  const totalMins = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins = totalMins % 60;

  if (days > 0) return `${days}d${hours}h`;
  if (hours > 0) return `${hours}h${mins}m`;
  return `${mins}m`;
}
export function formatSyncTime(fetchedAtMs?: number, now = Date.now()): string {
  if (!fetchedAtMs) return "";
  const d = new Date(fetchedAtMs);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const timeStr = `${hh}:${mm}`;

  const diffMs = Math.max(0, now - fetchedAtMs);
  const diffMins = Math.floor(diffMs / 60_000);

  let relStr = "just now";
  if (diffMins >= 60) {
    const hrs = Math.floor(diffMins / 60);
    const remMins = diffMins % 60;
    relStr = remMins > 0 ? `${hrs}h ${remMins}m ago` : `${hrs}h ago`;
  } else if (diffMins >= 1) {
    relStr = `${diffMins}m ago`;
  }

  return `· 󰑐 ${timeStr} (${relStr})`;
}

const BRAILLE_STEPS = ["⠀", "⡀", "⣀", "⣄", "⣤", "⣦", "⣶", "⣷", "⣿"];

export function render12Bar(fraction: number): { bar: string; pctStr: string; alertIcon: string } {
  const width = 12;
  const rawFilled = Math.min(width, Math.max(0, fraction * width));
  const fullBlocks = Math.floor(rawFilled);
  const remainder = rawFilled - fullBlocks;
  const pct = Math.round(fraction * 100);

  let alertIcon = "";
  if (pct >= 85) alertIcon = "󰀪 ";
  else if (pct >= 60) alertIcon = "▲ ";

  let barChars = "⣿".repeat(fullBlocks);
  if (fullBlocks < width) {
    const subStep = Math.min(8, Math.max(0, Math.round(remainder * 8)));
    barChars += BRAILLE_STEPS[subStep] ?? "⠀";

    const remainingEmpty = width - barChars.length;
    if (remainingEmpty > 0) {
      barChars += "⠀".repeat(remainingEmpty);
    }
  }

  const bar = `[${barChars}]`;
  return { bar, pctStr: `${pct}%`, alertIcon };
}

export function getProviderPrefix(provider: string): string {
  switch (provider) {
    case "anthropic":
      return "󰛄 claude";
    case "openai-codex":
      return "󰚩 codex";
    case "kimi-code":
      return "󰍛 kimi";
    case "google-antigravity":
    default:
      return "󰚩 antigravity";
  }
}

export function buildProviderSparklineString(
  provider: string,
  usageData: UsagePayload,
  now = Date.now(),
  fetchedAtMs?: number,
): string {
  const report = usageData.reports?.find(
    (r) =>
      r.provider.toLowerCase() === provider.toLowerCase() ||
      provider.toLowerCase().includes(r.provider.toLowerCase()),
  );
  if (!report || !report.limits || report.limits.length === 0) return "";

  const activeBars: string[] = [];
  const idleSummaries: string[] = [];

  // Sort limits so short windows (5h, 1d) always display before long windows (7d, 30d)
  const sortedLimits = [...report.limits].sort((a, b) => {
    const durA = a.window?.durationMs ?? (/5h|5\s*hour/i.test(a.label || a.id || "") ? 18000000 : 604800000);
    const durB = b.window?.durationMs ?? (/5h|5\s*hour/i.test(b.label || b.id || "") ? 18000000 : 604800000);
    return durA - durB;
  });

  for (const l of sortedLimits) {
    let name = (l.window?.label || l.label || l.id || "").trim();
    if (/Usage \(Google\)/i.test(l.label || "")) name = "gemini 1d";
    else if (/Usage \(OpenAI\)/i.test(l.label || "")) name = "openai 1d";
    else if (/Usage \(Anthropic\)/i.test(l.label || "")) name = "claude 1d";
    else if (/5\s*h/i.test(name)) name = "5h";
    else if (/7\s*d|total\s*quota/i.test(name) || /7d/i.test(l.id || "")) name = "7d";
    else if (/daily|1\s*d/i.test(name)) name = "1d";
    else if (/month|30\s*d/i.test(name)) name = "30d";

    const fraction = l.amount.usedFraction;
    const pct = Math.round(fraction * 100);

    // Smart Focus: collapse 0% sub-quotas in Antigravity
    if (provider === "google-antigravity" && pct === 0 && report.limits.length > 1) {
      const shortName = name.replace(/\s*1d/i, "");
      idleSummaries.push(`${shortName}: 0%`);
      continue;
    }

    const { bar, pctStr, alertIcon } = render12Bar(fraction);
    const reset = l.window?.resetsAt ? ` 󰥔 ${formatReset(l.window.resetsAt, now)}` : "";

    activeBars.push(`${alertIcon}${name} ${bar} ${pctStr}${reset}`);
  }

  const prefix = getProviderPrefix(provider);
  let result = `${prefix}  ${activeBars.join("  ")}`;
  if (idleSummaries.length > 0) {
    result += `  (${idleSummaries.join(" · ")})`;
  }

  const syncTag = formatSyncTime(fetchedAtMs, now);
  if (syncTag) {
    result += `  ${syncTag}`;
  }

  return result;
}

export function isSubagent(ctx?: ExtensionContext): boolean {
  if (!ctx) return false;
  if ((ctx as Record<string, unknown>).isSubagent === true) return true;
  const sessionFile = ctx?.sessionManager?.getSessionFile?.() || "";
  if (!sessionFile) return false;
  const baseName = sessionFile.split("/").pop() || "";
  return !/^\d{4}-\d{2}-\d{2}T/.test(baseName);
}

export interface ExtensionContext {
  model?: string;
  models?: {
    current?: () => string;
  };
  sessionManager?: {
    getSessionFile(): string;
  };
  ui?: {
    setStatus(key: string, text: string): void;
  };
}

export async function getLatestModelFromSession(sessionFile?: string): Promise<string | undefined> {
  if (!sessionFile || !fs.existsSync(sessionFile)) return undefined;
  let lastModel: string | undefined;
  const rl = readline.createInterface({ input: fs.createReadStream(sessionFile) });
  for await (const line of rl) {
    if (!line) continue;
    try {
      const rec = JSON.parse(line);
      if (rec.type === "model_change" && rec.model) {
        lastModel = rec.model;
      }
    } catch {}
  }
  return lastModel;
}

export default function (pi: ExtensionAPI) {
  async function syncStatus(ctx?: ExtensionContext, force = false) {
    if (isSubagent(ctx)) return;
    if (ctx) lastCtx = ctx;
    const c = ctx || lastCtx;
    if (!c?.ui?.setStatus) return;

    const data = await fetchUsage(force);
    if (!data) return;
    const sessionFile = c?.sessionManager?.getSessionFile();
    const sessionModel = await getLatestModelFromSession(sessionFile);
    const modelStr = sessionModel || (c?.models?.current ? c.models.current() : (c?.model || "google-antigravity/gemini-3.7-flash"));

    // Strictly extract the exact provider prefix before the first slash
    const slashIdx = modelStr.indexOf("/");
    const provider = slashIdx > 0 ? modelStr.slice(0, slashIdx).toLowerCase() : modelStr.toLowerCase();

    const sparklines = buildProviderSparklineString(provider, data, Date.now(), lastFetchTime);
    c.ui.setStatus("quota_status", sparklines);
  }

  // 1. OMP launch / session start: live initial fetch
  pi.on("session_start", async (_event: unknown, ctx: ExtensionContext) => {
    await syncStatus(ctx, true);
  });

  // 2. Turn start: instant provider sync before prompt starts
  pi.on("agent_start", async (_event: unknown, ctx: ExtensionContext) => {
    await syncStatus(ctx, false);
  });

  // 3. Turn end: refresh with 10s cooldown
  pi.on("agent_end", async (_event: unknown, ctx: ExtensionContext) => {
    await syncStatus(ctx, false);
  });
  pi.registerCommand("quota-refresh", {
    description: "Force live refresh of provider quota usage",
    handler: async (_args, ctx) => {
      await syncStatus(ctx, true);
    },
  });
}

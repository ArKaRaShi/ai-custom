import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";

const execAsync = promisify(exec);

export interface QuotaLimitScope {
  user?: boolean;
  model?: string;
  family?: string;
}

export interface QuotaLimitWindow {
  duration?: string;
  durationMs?: number;
  label?: string;
  sliding?: boolean;
  resetsAt?: number;
}

export interface QuotaLimitAmount {
  limit?: number;
  used?: number;
  usedFraction: number;
  remaining?: number;
  percent?: number;
  unit?: string;
}

export interface QuotaLimit {
  id?: string;
  label?: string;
  kind?: "sliding" | "calendar" | "session";
  scope?: QuotaLimitScope;
  window?: QuotaLimitWindow;
  amount: QuotaLimitAmount;
}

export interface ProviderReportMetadata {
  provider: string;
  source?: "upstream" | "cached" | "offline";
  fetchedAt?: number;
  status?: "ok" | "stale" | "error" | "unsupported";
  error?: string;
  account?: string;
  plan?: string;
  email?: string;
}

export interface ProviderReport {
  provider: string;
  limits: QuotaLimit[];
  metadata?: ProviderReportMetadata;
}

export interface CapacityItem {
  window?: string;
  durationMs?: number;
  accounts?: number;
  usedAccounts?: number;
  remainingAccounts?: number;
}

export interface UsagePayload {
  version?: number;
  timestamp?: number;
  reports: ProviderReport[];
  capacity?: Record<string, CapacityItem[]>;
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
        await execAsync("omp usage invalidate", { timeout: 3000 });
      } catch {}
    }
    const { stdout } = await execAsync("omp usage --json", { timeout: 5000 });
    cachedUsage = JSON.parse(stdout) as UsagePayload;
    lastFetchTime = now;
    return cachedUsage;
  } catch {
    return cachedUsage;
  }
}

const RESET_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatReset(resetsAtMs?: number, now = Date.now()): string {
  if (!resetsAtMs) return "";
  const diffMs = resetsAtMs - now;
  if (diffMs <= 0) return "0m";
  const totalMins = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins = totalMins % 60;

  const target = new Date(resetsAtMs);
  const hh = String(target.getHours()).padStart(2, "0");
  const mm = String(target.getMinutes()).padStart(2, "0");
  const timeStr = `${hh}:${mm}`;

  if (days > 0) {
    const dayName = RESET_DAYS[target.getDay()];
    return `${days}d${hours}h @${dayName} ${timeStr}`;
  }
  if (hours > 0) return `${hours}h${mins}m @${timeStr}`;
  return `${mins}m @${timeStr}`;
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
  switch (provider.toLowerCase()) {
    case "anthropic":
      return "󰛄 claude";
    case "openai-codex":
    case "openai":
      return "󰚩 codex";
    case "kimi-code":
    case "kimi":
    case "moonshot":
      return "󰍛 kimi";
    case "google-antigravity":
    case "google":
    case "gemini":
    default:
      return "󰚩 antigravity";
  }
}

/**
 * Renders the Option A layout: Active account focus + deduplicated idle tags + pool capacity pill.
 */
export function buildProviderSparklineString(
  provider: string,
  usageData: UsagePayload,
  now = Date.now(),
  fetchedAtMs?: number,
): string {
  const matchingReports = usageData.reports?.filter(
    (r) =>
      r.provider.toLowerCase() === provider.toLowerCase() ||
      provider.toLowerCase().includes(r.provider.toLowerCase()),
  );

  if (!matchingReports || matchingReports.length === 0) return "";

  // 1. Pick the Active Account:
  // Sort accounts so that the one with active short-window usage (5h) comes first.
  const activeReport = [...matchingReports].sort((a, b) => {
    const shortLimitA = a.limits?.find((l) => /5h|5\s*hour/i.test(l.id || l.label || ""));
    const shortLimitB = b.limits?.find((l) => /5h|5\s*hour/i.test(l.id || l.label || ""));
    const usedA = shortLimitA?.amount?.usedFraction ?? 0;
    const usedB = shortLimitB?.amount?.usedFraction ?? 0;
    if (usedA !== usedB) return usedB - usedA; // highest 5h activity first

    // Fallback: highest overall max window usage
    const maxA = Math.max(0, ...(a.limits || []).map((l) => l.amount?.usedFraction ?? 0));
    const maxB = Math.max(0, ...(b.limits || []).map((l) => l.amount?.usedFraction ?? 0));
    return maxB - maxA;
  })[0];

  if (!activeReport || !activeReport.limits || activeReport.limits.length === 0) return "";

  const activeBars: string[] = [];
  const idleSummariesSet = new Set<string>();

  // Sort limits so short windows (5h, 1d) always display before long windows (7d, 30d)
  const sortedLimits = [...activeReport.limits].sort((a, b) => {
    const durA = a.window?.durationMs ?? (/5h|5\s*hour/i.test(a.label || a.id || "") ? 18000000 : 604800000);
    const durB = b.window?.durationMs ?? (/5h|5\s*hour/i.test(b.label || b.id || "") ? 18000000 : 604800000);
    return durA - durB;
  });

  for (const l of sortedLimits) {
    let name = (l.id || l.window?.label || l.label || "").trim();
    if (/Usage \(Google\)/i.test(l.label || "")) {
      name = /5h|5\s*hour/i.test(l.id || l.window?.id || "") ? "gemini 5h" : "gemini 1d";
    } else if (/Usage \(OpenAI\)/i.test(l.label || "")) {
      name = /5h|5\s*hour/i.test(l.id || l.window?.id || "") ? "openai 5h" : "openai 1d";
    } else if (/Usage \(Anthropic\)/i.test(l.label || "")) {
      name = /5h|5\s*hour/i.test(l.id || l.window?.id || "") ? "claude 5h" : "claude 1d";
    } else if (/5\s*h|5-hour/i.test(name) || l.id === "5h") {
      name = "5h";
    } else if (/7\s*d|7-day|total\s*quota/i.test(name) || l.id === "7d") {
      name = "7d";
    } else if (/daily|1\s*d/i.test(name) || l.id === "1d") {
      name = "1d";
    } else if (/month|30\s*d/i.test(name) || l.id === "30d") {
      name = "30d";
    }

    const fraction = l.amount?.usedFraction ?? 0;
    const pct = Math.round(fraction * 100);
    const resetStr = l.window?.resetsAt ? ` 󰥔 ${formatReset(l.window.resetsAt, now)}` : "";

    // Collapse 100% exhausted quota into a compact alert pill tag
    if (pct >= 100) {
      activeBars.push(`󰀪 [${name}: 100%${resetStr}]`);
      continue;
    }

    // Smart Focus: collapse 0% sub-quotas in Antigravity (deduplicated via Set)
    if (provider === "google-antigravity" && pct === 0 && activeReport.limits.length > 1) {
      const shortName = name.replace(/\s*(?:1d|5h)/i, "").trim();
      idleSummariesSet.add(`${shortName}: 0%`);
      continue;
    }

    const { bar, pctStr, alertIcon } = render12Bar(fraction);
    activeBars.push(`${alertIcon}${name} ${bar} ${pctStr}${resetStr}`);
  }

  const prefix = getProviderPrefix(provider);
  let result = `${prefix}  ${activeBars.join("  ")}`;

  const idleSummaries = Array.from(idleSummariesSet);
  if (idleSummaries.length > 0) {
    result += `  (${idleSummaries.join(" · ")})`;
  }

  // Multi-Account Pool Capacity Pill
  const capacityList = usageData.capacity?.[provider];
  if (capacityList && capacityList.length > 0) {
    const primaryCap = capacityList.find((c) => /5h/i.test(c.window || "")) || capacityList[0];
    if (primaryCap && (primaryCap.accounts ?? 0) > 1) {
      const leftRatio = (primaryCap.remainingAccounts ?? 0).toFixed(2);
      result += `  [pool: ${primaryCap.accounts} accts · ${leftRatio}× left]`;
    }
  }

  const syncTag = formatSyncTime(fetchedAtMs, now);
  if (syncTag) {
    result += `  ${syncTag}`;
  }

  return result;
}

export interface ExtensionContext {
  isSubagent?: boolean;
  model?: string | { id?: string; name?: string; provider?: string };
  models?: {
    current?: () => string | { id?: string; name?: string; provider?: string } | undefined;
  };
  sessionManager?: {
    getSessionFile(): string;
  };
  ui?: {
    setStatus?(key: string, text: string): void;
    setWidget?(key: string, lines: string[], options?: { placement?: string }): void;
  };
}

export function isSubagent(ctx?: ExtensionContext): boolean {
  if (!ctx) return false;
  if (ctx.isSubagent === true) return true;
  const sessionFile = ctx.sessionManager?.getSessionFile?.() || "";
  if (!sessionFile) return false;
  const baseName = sessionFile.split("/").pop() || "";
  return !/^\d{4}-\d{2}-\d{2}T/.test(baseName);
}

export function normalizeModelSelector(model: unknown): string {
  if (typeof model === "string") return model;
  if (typeof model !== "object" || model === null) return "";

  const value = model as { id?: unknown; name?: unknown; provider?: unknown };
  const modelId = typeof value.id === "string"
    ? value.id
    : typeof value.name === "string"
      ? value.name
      : "";
  const provider = typeof value.provider === "string" ? value.provider.trim() : "";
  return provider && modelId && !modelId.includes("/")
    ? `${provider}/${modelId}`
    : modelId;
}

export async function getLatestModelFromSession(sessionFile?: string): Promise<string | undefined> {
  if (!sessionFile || !fs.existsSync(sessionFile)) return undefined;
  try {
    const content = typeof Bun !== "undefined"
      ? await Bun.file(sessionFile).text()
      : fs.readFileSync(sessionFile, "utf-8");

    const lines = content.split("\n");
    let lastModel: string | undefined;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const rec = JSON.parse(line);
        if (rec.type === "model_change" && rec.model) {
          lastModel = normalizeModelSelector(rec.model);
        }
      } catch {}
    }
    return lastModel;
  } catch {
    return undefined;
  }
}

export function setQuotaStatus(ctx: ExtensionContext, text: string): void {
  if (ctx.ui?.setStatus) {
    ctx.ui.setStatus("quota_status", text);
  } else if (ctx.ui?.setWidget) {
    ctx.ui.setWidget("quota_status", [text], { placement: "belowEditor" });
  }
}

export function setQuotaWidget(ctx: ExtensionContext, text: string): void {
  if (ctx.ui?.setWidget) {
    ctx.ui.setWidget("quota_status", [text], { placement: "belowEditor" });
  } else if (ctx.ui?.setStatus) {
    ctx.ui.setStatus("quota_status", text);
  }
}

export default function (pi: ExtensionAPI) {
  async function syncStatus(ctx?: ExtensionContext, force = false) {
    if (isSubagent(ctx)) return;
    if (ctx) lastCtx = ctx;
    const effectiveCtx = ctx || lastCtx;
    if (!effectiveCtx) return;

    const data = await fetchUsage(force);
    if (!data || !data.reports) return;

    let modelName = "";
    if (effectiveCtx.models?.current) {
      modelName = normalizeModelSelector(effectiveCtx.models.current());
    }
    if (!modelName && effectiveCtx.model) {
      modelName = normalizeModelSelector(effectiveCtx.model);
    }
    if (!modelName && effectiveCtx.sessionManager) {
      modelName = (await getLatestModelFromSession(effectiveCtx.sessionManager.getSessionFile())) || "";
    }

    const providerKey = modelName.split("/")[0] || data.reports[0]?.provider || "";
    if (!providerKey) return;

    const statusText = buildProviderSparklineString(
      providerKey,
      data,
      Date.now(),
      data.reports.find((r) => r.provider === providerKey)?.metadata?.fetchedAt,
    );
    if (statusText) {
      setQuotaWidget(effectiveCtx, statusText);
    }
  }

  pi.on("agent_start", async (_event: unknown, ctx: ExtensionContext) => {
    await syncStatus(ctx, false);
  });

  pi.on("agent_end", async (_event: unknown, ctx: ExtensionContext) => {
    await syncStatus(ctx, false);
  });

  pi.on("session_resume", async (_event: unknown, ctx: ExtensionContext) => {
    await syncStatus(ctx, true);
  });
}

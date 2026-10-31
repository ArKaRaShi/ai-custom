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
  id?: string;
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

export interface ThemeLike {
  fg(token: string, text: string): string;
}

export interface RenderOptions {
  now?: number;
  fetchedAtMs?: number;
  theme?: ThemeLike;
  activeModel?: string;
}

let cachedUsage: UsagePayload | null = null;
let lastFetchTime = 0;
let lastCtx: ExtensionContext | null = null;

export async function fetchUsage(forceRefresh = false): Promise<UsagePayload | null> {
  const now = Date.now();
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
    const parsed = JSON.parse(stdout) as UsagePayload;
    cachedUsage = parsed;
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
  const targetHours = target.getHours();
  const hh = String(targetHours).padStart(2, "0");
  const targetMins = target.getMinutes();
  const mm = String(targetMins).padStart(2, "0");
  const timeStr = `${hh}:${mm}`;

  if (days > 0) {
    const targetDay = target.getDay();
    const dayName = RESET_DAYS[targetDay];
    return `${days}d${hours}h @${dayName} ${timeStr}`;
  }
  if (hours > 0) return `${hours}h${mins}m @${timeStr}`;
  return `${mins}m @${timeStr}`;
}

export function formatSyncTime(fetchedAtMs?: number, now = Date.now()): string {
  if (!fetchedAtMs) return "";
  const d = new Date(fetchedAtMs);
  const dHours = d.getHours();
  const hh = String(dHours).padStart(2, "0");
  const dMins = d.getMinutes();
  const mm = String(dMins).padStart(2, "0");
  const timeStr = `${hh}:${mm}`;

  const diffMsRaw = now - fetchedAtMs;
  const diffMs = Math.max(0, diffMsRaw);
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

export function render12Bar(
  fraction: number,
  theme?: ThemeLike,
): { bar: string; pctStr: string; alertIcon: string } {
  const width = 12;
  const clampedMin = Math.max(0, fraction);
  const safeFraction = Math.min(1, clampedMin);
  const rawFilled = safeFraction * width;
  const fullBlocks = Math.floor(rawFilled);
  const remainder = rawFilled - fullBlocks;
  const pctFloat = fraction * 100;
  const pct = Math.round(pctFloat);

  let alertIcon = "";
  if (pct >= 85) {
    alertIcon = theme ? theme.fg("error", "󰀪 ") : "󰀪 ";
  } else if (pct >= 60) {
    alertIcon = theme ? theme.fg("warning", "▲ ") : "▲ ";
  }

  let filledChars = "⣿".repeat(fullBlocks);
  let emptyChars = "";
  if (fullBlocks < width) {
    const subStepRaw = Math.round(remainder * 8);
    const subStepMax = Math.max(0, subStepRaw);
    const subStep = Math.min(8, subStepMax);
    if (subStep > 0) {
      const stepChar = BRAILLE_STEPS[subStep] ?? "⠀";
      filledChars += stepChar;
    }

    const usedCols = subStep > 0 ? fullBlocks + 1 : fullBlocks;
    const remainingEmpty = width - usedCols;
    if (remainingEmpty > 0) {
      emptyChars = "⠀".repeat(remainingEmpty);
    }
  }

  if (theme) {
    let barColor = "success";
    if (pct >= 100) {
      barColor = "error";
    } else if (pct >= 80) {
      barColor = "warning";
    } else if (pct >= 50) {
      barColor = "accent";
    }

    const coloredFilled = theme.fg(barColor, filledChars);
    const coloredEmpty = theme.fg("dim", emptyChars);
    const bar = `[${coloredFilled}${coloredEmpty}]`;
    const pctText = `${pct}%`;
    const pctStr = theme.fg("text", pctText);
    return { bar, pctStr, alertIcon };
  }

  const bar = `[${filledChars}${emptyChars}]`;
  const pctStr = `${pct}%`;
  return { bar, pctStr, alertIcon };
}

export function getActiveModelFamily(modelName?: string): string {
  if (!modelName) return "";
  const lower = modelName.toLowerCase();
  if (lower.includes("claude") || lower.includes("anthropic")) return "claude";
  if (
    lower.includes("gpt") ||
    lower.includes("o1") ||
    lower.includes("o3") ||
    lower.includes("openai") ||
    lower.includes("codex")
  ) {
    return "openai";
  }
  if (lower.includes("gemini") || lower.includes("google")) return "gemini";
  if (lower.includes("kimi") || lower.includes("moonshot")) return "kimi";
  return "";
}

// ---------------------------------------------------------------------------
// Provider Strategy Pattern
// ---------------------------------------------------------------------------

export interface ProviderQuotaResolver {
  readonly id: string;
  readonly prefix: string;
  matches(provider: string): boolean;
  resolve(
    provider: string,
    usageData: UsagePayload,
    options: RenderOptions,
  ): string;
}

abstract class BaseQuotaResolver implements ProviderQuotaResolver {
  abstract readonly id: string;
  abstract readonly prefix: string;
  abstract matches(provider: string): boolean;

  abstract resolve(
    provider: string,
    usageData: UsagePayload,
    options: RenderOptions,
  ): string;

  protected filterMatchingReports(provider: string, usageData: UsagePayload): ProviderReport[] {
    const lower = provider.toLowerCase();
    const reports = usageData.reports || [];
    return reports.filter((r) => {
      const rLower = r.provider.toLowerCase();
      return rLower === lower || lower.includes(rLower);
    });
  }

  protected pickActiveReport(matchingReports: ProviderReport[]): ProviderReport | undefined {
    const sorted = [...matchingReports].sort((a, b) => {
      const shortLimitA = a.limits?.find((l) => /5h|5\s*hour/i.test(l.id || l.label || ""));
      const shortLimitB = b.limits?.find((l) => /5h|5\s*hour/i.test(l.id || l.label || ""));
      const usedA = shortLimitA?.amount?.usedFraction ?? 0;
      const usedB = shortLimitB?.amount?.usedFraction ?? 0;
      const exhaustedA = usedA >= 1 ? 1 : 0;
      const exhaustedB = usedB >= 1 ? 1 : 0;
      if (exhaustedA !== exhaustedB) return exhaustedA - exhaustedB;
      if (usedA !== usedB) return usedB - usedA;

      const maxA = Math.max(0, ...(a.limits || []).map((l) => l.amount?.usedFraction ?? 0));
      const maxB = Math.max(0, ...(b.limits || []).map((l) => l.amount?.usedFraction ?? 0));
      return maxB - maxA;
    });
    return sorted[0];
  }

  protected sortLimits(limits: QuotaLimit[]): QuotaLimit[] {
    return [...limits].sort((a, b) => {
      const durA = a.window?.durationMs ?? (/5h|5\s*hour/i.test(a.label || a.id || "") ? 18000000 : 604800000);
      const durB = b.window?.durationMs ?? (/5h|5\s*hour/i.test(b.label || b.id || "") ? 18000000 : 604800000);
      return durA - durB;
    });
  }

  protected renderPoolSummary(
    provider: string,
    matchingReports: ProviderReport[],
    usageData: UsagePayload,
    theme?: ThemeLike,
  ): string {
    if (matchingReports.length <= 1) return "";

    const exhaustedAccounts = matchingReports.filter((report) => {
      const shortLimit = report.limits?.find((l) => /5h|5\s*hour/i.test(l.id || l.label || ""));
      const fraction = shortLimit?.amount?.usedFraction ?? Math.max(
        0,
        ...(report.limits || []).map((l) => l.amount?.usedFraction ?? 0),
      );
      return fraction >= 1;
    }).length;
    const availableAccounts = matchingReports.length - exhaustedAccounts;
    const poolParts = [
      `${matchingReports.length} accts`,
      `${exhaustedAccounts} exhausted`,
      `${availableAccounts} available`,
    ];
    const capacityList = usageData.capacity?.[provider];
    const primaryCap = capacityList?.find((c) => /5h/i.test(c.window || "")) || capacityList?.[0];
    if (primaryCap?.remainingAccounts !== undefined) {
      const remAcctsStr = primaryCap.remainingAccounts.toFixed(2);
      poolParts.push(`${remAcctsStr}× left`);
    }
    const poolJoined = poolParts.join(" · ");
    const poolText = `[pool: ${poolJoined}]`;
    return theme ? theme.fg("muted", poolText) : poolText;
  }
}

/**
 * Strategy for OpenRouter: Pay-per-token with no fixed quota limit.
 */
export class OpenRouterResolver extends BaseQuotaResolver {
  readonly id = "openrouter";
  readonly prefix = "󱚝 openrouter";

  matches(provider: string): boolean {
    const lower = provider.toLowerCase();
    return lower.includes("openrouter");
  }

  resolve(
    _provider: string,
    _usageData: UsagePayload,
    options: RenderOptions,
  ): string {
    const theme = options.theme;
    const prefixText = this.prefix;
    const prefix = theme ? theme.fg("accent", prefixText) : prefixText;
    const tagText = "pay-per-token  (no fixed quota)";
    const tag = theme ? theme.fg("muted", tagText) : tagText;
    return `${prefix}  ${tag}`;
  }
}

/**
 * Strategy for Google Antigravity:
 * Option 2 Model Focus:
 * 1. Always shows 5h rolling window in full.
 * 2. Matches active model (gemini, claude, openai) and renders its weekly bar in full.
 * 3. Collapses inactive sub-quotas into clean summary tags (e.g. claude: 47% · openai: 47%).
 * 4. Cleans up internal raw IDs and eliminates broken '(: 0%)'.
 */
export class GoogleAntigravityResolver extends BaseQuotaResolver {
  readonly id = "google-antigravity";
  readonly prefix = "󰚩 antigravity";

  matches(provider: string): boolean {
    const lower = provider.toLowerCase();
    return (
      lower === "google-antigravity" ||
      lower === "antigravity" ||
      lower === "google" ||
      lower === "gemini"
    );
  }

  resolve(
    provider: string,
    usageData: UsagePayload,
    options: RenderOptions,
  ): string {
    const matchingReports = this.filterMatchingReports(provider, usageData);
    if (matchingReports.length === 0) return "";

    const activeReport = this.pickActiveReport(matchingReports);
    if (!activeReport || !activeReport.limits || activeReport.limits.length === 0) return "";

    const now = options.now ?? Date.now();
    const theme = options.theme;
    const activeModel = options.activeModel;
    const activeFamily = getActiveModelFamily(activeModel);

    const sortedLimits = this.sortLimits(activeReport.limits);
    const activeBars: string[] = [];
    const idleSummariesSet = new Set<string>();

    for (const l of sortedLimits) {
      const rawId = (l.id || "").toLowerCase();
      const rawLabel = (l.label || l.window?.label || "").toLowerCase();
      const rawAll = `${rawId} ${rawLabel}`;

      let name = (l.id || l.window?.label || l.label || "").trim();
      let family = "";

      if (/anthropic|claude/i.test(rawAll)) {
        family = "claude";
        name = /5h|5\s*hour/i.test(rawAll) ? "claude 5h" : "claude";
      } else if (/openai/i.test(rawAll)) {
        family = "openai";
        name = /5h|5\s*hour/i.test(rawAll) ? "openai 5h" : "openai";
      } else if (/google|gemini/i.test(rawAll)) {
        family = "gemini";
        name = /5h|5\s*hour/i.test(rawAll) ? "gemini 5h" : "gemini";
      } else if (/5\s*h|5-hour/i.test(rawAll) || l.id === "5h") {
        family = "session";
        name = "5h";
      } else if (/7\s*d|7-day|weekly/i.test(rawAll) || l.id === "7d") {
        name = "7d";
      } else if (/daily|1\s*d/i.test(rawAll) || l.id === "1d") {
        name = "1d";
      }

      // Preserve legacy test name format for Usage (Google) when activeFamily not specified
      if (!activeFamily && /Usage \(Google\)/i.test(l.label || "")) {
        name = /5h|5\s*hour/i.test(l.id || l.window?.id || "") ? "gemini 5h" : "gemini 1d";
      } else if (!activeFamily && /Usage \(OpenAI\)/i.test(l.label || "")) {
        name = /5h|5\s*hour/i.test(l.id || l.window?.id || "") ? "openai 5h" : "openai 1d";
      }

      const fraction = l.amount?.usedFraction ?? 0;
      const pct = Math.round(fraction * 100);
      const resetFormatted = l.window?.resetsAt ? formatReset(l.window.resetsAt, now) : "";
      const resetDisplay = theme ? theme.fg("muted", resetFormatted) : resetFormatted;
      const resetStr = resetFormatted ? ` 󰥔 ${resetDisplay}` : "";

      if (pct >= 100) {
        if (matchingReports.length <= 1) {
          const tag = `󰀪 [${name}: 100%${resetStr}]`;
          const tagDisplay = theme ? theme.fg("error", tag) : tag;
          activeBars.push(tagDisplay);
        }
        continue;
      }

      // Option 2 Focus Filter
      if (family !== "session") {
        const isTargetFamily = activeFamily ? family === activeFamily : false;
        if (activeFamily && !isTargetFamily) {
          if (name) {
            idleSummariesSet.add(`${name}: ${pct}%`);
          }
          continue;
        }
        if (pct === 0 && activeReport.limits.length > 1) {
          if (name) {
            const shortName = name.replace(/\s*(?:1d|5h)/i, "").trim();
            if (shortName) {
              idleSummariesSet.add(`${shortName}: 0%`);
            }
          }
          continue;
        }
      }

      const { bar, pctStr, alertIcon } = render12Bar(fraction, theme);
      const barItem = `${alertIcon}${name} ${bar} ${pctStr}${resetStr}`;
      activeBars.push(barItem);
    }

    const prefixRaw = this.prefix;
    const prefix = theme ? theme.fg("accent", prefixRaw) : prefixRaw;
    const barsJoined = activeBars.join("  ");
    let result = `${prefix}  ${barsJoined}`;

    const idleSummaries = Array.from(idleSummariesSet);
    if (idleSummaries.length > 0) {
      const idleJoined = idleSummaries.join(" · ");
      const idleText = `(${idleJoined})`;
      const idleDisplay = theme ? theme.fg("muted", idleText) : idleText;
      result += `  ${idleDisplay}`;
    }

    const poolTag = this.renderPoolSummary(provider, matchingReports, usageData, theme);
    if (poolTag) {
      result += `  ${poolTag}`;
    }

    const syncTag = formatSyncTime(options.fetchedAtMs, now);
    if (syncTag) {
      const syncDisplay = theme ? theme.fg("muted", syncTag) : syncTag;
      result += `  ${syncDisplay}`;
    }

    return result;
  }
}

/**
 * Strategy for Anthropic / Claude.
 */
export class AnthropicResolver extends BaseQuotaResolver {
  readonly id = "anthropic";
  readonly prefix = "󰛄 claude";

  matches(provider: string): boolean {
    const lower = provider.toLowerCase();
    return lower === "anthropic" || lower === "claude";
  }

  resolve(
    provider: string,
    usageData: UsagePayload,
    options: RenderOptions,
  ): string {
    const matchingReports = this.filterMatchingReports(provider, usageData);
    if (matchingReports.length === 0) return "";

    const activeReport = this.pickActiveReport(matchingReports);
    if (!activeReport || !activeReport.limits || activeReport.limits.length === 0) return "";

    const now = options.now ?? Date.now();
    const theme = options.theme;
    const sortedLimits = this.sortLimits(activeReport.limits);
    const activeBars: string[] = [];

    for (const l of sortedLimits) {
      let name = (l.id || l.window?.label || l.label || "").trim();
      if (/5\s*h|5-hour/i.test(name) || l.id === "5h") {
        name = "5h";
      } else if (/7\s*d|7-day|weekly|total\s*quota/i.test(name) || l.id === "7d") {
        name = "7d";
      }

      const fraction = l.amount?.usedFraction ?? 0;
      const pct = Math.round(fraction * 100);
      const resetFormatted = l.window?.resetsAt ? formatReset(l.window.resetsAt, now) : "";
      const resetDisplay = theme ? theme.fg("muted", resetFormatted) : resetFormatted;
      const resetStr = resetFormatted ? ` 󰥔 ${resetDisplay}` : "";

      if (pct >= 100) {
        if (matchingReports.length <= 1) {
          const tag = `󰀪 [${name}: 100%${resetStr}]`;
          const tagDisplay = theme ? theme.fg("error", tag) : tag;
          activeBars.push(tagDisplay);
        }
        continue;
      }

      const { bar, pctStr, alertIcon } = render12Bar(fraction, theme);
      const barItem = `${alertIcon}${name} ${bar} ${pctStr}${resetStr}`;
      activeBars.push(barItem);
    }

    const prefixRaw = this.prefix;
    const prefix = theme ? theme.fg("accent", prefixRaw) : prefixRaw;
    const barsJoined = activeBars.join("  ");
    let result = `${prefix}  ${barsJoined}`;

    const poolTag = this.renderPoolSummary(provider, matchingReports, usageData, theme);
    if (poolTag) {
      result += `  ${poolTag}`;
    }

    const syncTag = formatSyncTime(options.fetchedAtMs, now);
    if (syncTag) {
      const syncDisplay = theme ? theme.fg("muted", syncTag) : syncTag;
      result += `  ${syncDisplay}`;
    }

    return result;
  }
}

/**
 * Strategy for OpenAI / Codex.
 */
export class OpenAIResolver extends BaseQuotaResolver {
  readonly id = "openai";
  readonly prefix: string;

  constructor(providerName = "openai") {
    super();
    this.prefix = providerName.includes("codex") ? "󰚩 codex" : "󰛄 openai";
  }

  matches(provider: string): boolean {
    const lower = provider.toLowerCase();
    return lower === "openai" || lower === "openai-codex" || lower === "codex";
  }

  resolve(
    provider: string,
    usageData: UsagePayload,
    options: RenderOptions,
  ): string {
    const matchingReports = this.filterMatchingReports(provider, usageData);
    if (matchingReports.length === 0) return "";

    const activeReport = this.pickActiveReport(matchingReports);
    if (!activeReport || !activeReport.limits || activeReport.limits.length === 0) return "";

    const now = options.now ?? Date.now();
    const theme = options.theme;
    const sortedLimits = this.sortLimits(activeReport.limits);
    const activeBars: string[] = [];

    for (const l of sortedLimits) {
      let name = (l.id || l.window?.label || l.label || "").trim();
      if (/5\s*h|5-hour/i.test(name) || l.id === "5h") {
        name = "5h";
      } else if (/1\s*d|daily/i.test(name) || l.id === "1d") {
        name = "1d";
      } else if (/7\s*d|7-day|weekly/i.test(name) || l.id === "7d") {
        name = "7d";
      }

      const fraction = l.amount?.usedFraction ?? 0;
      const pct = Math.round(fraction * 100);
      const resetFormatted = l.window?.resetsAt ? formatReset(l.window.resetsAt, now) : "";
      const resetDisplay = theme ? theme.fg("muted", resetFormatted) : resetFormatted;
      const resetStr = resetFormatted ? ` 󰥔 ${resetDisplay}` : "";

      if (pct >= 100) {
        if (matchingReports.length <= 1) {
          const tag = `󰀪 [${name}: 100%${resetStr}]`;
          const tagDisplay = theme ? theme.fg("error", tag) : tag;
          activeBars.push(tagDisplay);
        }
        continue;
      }

      const { bar, pctStr, alertIcon } = render12Bar(fraction, theme);
      const barItem = `${alertIcon}${name} ${bar} ${pctStr}${resetStr}`;
      activeBars.push(barItem);
    }

    const prefixRaw = provider.toLowerCase().includes("codex") ? "󰚩 codex" : "󰛄 openai";
    const prefix = theme ? theme.fg("accent", prefixRaw) : prefixRaw;
    const barsJoined = activeBars.join("  ");
    let result = `${prefix}  ${barsJoined}`;

    const poolTag = this.renderPoolSummary(provider, matchingReports, usageData, theme);
    if (poolTag) {
      result += `  ${poolTag}`;
    }

    const syncTag = formatSyncTime(options.fetchedAtMs, now);
    if (syncTag) {
      const syncDisplay = theme ? theme.fg("muted", syncTag) : syncTag;
      result += `  ${syncDisplay}`;
    }

    return result;
  }
}

/**
 * Strategy for Kimi / Moonshot.
 */
export class KimiResolver extends BaseQuotaResolver {
  readonly id = "kimi";
  readonly prefix = "󰍛 kimi";

  matches(provider: string): boolean {
    const lower = provider.toLowerCase();
    return lower === "kimi" || lower === "kimi-code" || lower === "moonshot";
  }

  resolve(
    provider: string,
    usageData: UsagePayload,
    options: RenderOptions,
  ): string {
    const matchingReports = this.filterMatchingReports(provider, usageData);
    if (matchingReports.length === 0) return "";

    const activeReport = this.pickActiveReport(matchingReports);
    if (!activeReport || !activeReport.limits || activeReport.limits.length === 0) return "";

    const now = options.now ?? Date.now();
    const theme = options.theme;
    const sortedLimits = this.sortLimits(activeReport.limits);
    const activeBars: string[] = [];

    for (const l of sortedLimits) {
      let name = (l.id || l.window?.label || l.label || "").trim();
      if (/5\s*h|5-hour/i.test(name) || l.id === "5h") {
        name = "5h";
      } else if (/7\s*d|7-day|weekly/i.test(name) || l.id === "7d") {
        name = "7d";
      } else if (/30\s*d|month/i.test(name) || l.id === "30d") {
        name = "30d";
      }

      const fraction = l.amount?.usedFraction ?? 0;
      const pct = Math.round(fraction * 100);
      const resetFormatted = l.window?.resetsAt ? formatReset(l.window.resetsAt, now) : "";
      const resetDisplay = theme ? theme.fg("muted", resetFormatted) : resetFormatted;
      const resetStr = resetFormatted ? ` 󰥔 ${resetDisplay}` : "";

      if (pct >= 100) {
        if (matchingReports.length <= 1) {
          const tag = `󰀪 [${name}: 100%${resetStr}]`;
          const tagDisplay = theme ? theme.fg("error", tag) : tag;
          activeBars.push(tagDisplay);
        }
        continue;
      }

      const { bar, pctStr, alertIcon } = render12Bar(fraction, theme);
      const barItem = `${alertIcon}${name} ${bar} ${pctStr}${resetStr}`;
      activeBars.push(barItem);
    }

    const prefixRaw = this.prefix;
    const prefix = theme ? theme.fg("accent", prefixRaw) : prefixRaw;
    const barsJoined = activeBars.join("  ");
    let result = `${prefix}  ${barsJoined}`;

    const poolTag = this.renderPoolSummary(provider, matchingReports, usageData, theme);
    if (poolTag) {
      result += `  ${poolTag}`;
    }

    const syncTag = formatSyncTime(options.fetchedAtMs, now);
    if (syncTag) {
      const syncDisplay = theme ? theme.fg("muted", syncTag) : syncTag;
      result += `  ${syncDisplay}`;
    }

    return result;
  }
}

/**
 * Fallback strategy for general / untracked providers.
 */
export class DefaultResolver extends BaseQuotaResolver {
  readonly id = "default";
  readonly prefix = "󰚩 antigravity";

  matches(_provider: string): boolean {
    return true;
  }

  resolve(
    provider: string,
    usageData: UsagePayload,
    options: RenderOptions,
  ): string {
    const matchingReports = this.filterMatchingReports(provider, usageData);
    if (matchingReports.length === 0) return "";

    const activeReport = this.pickActiveReport(matchingReports);
    if (!activeReport || !activeReport.limits || activeReport.limits.length === 0) return "";

    const now = options.now ?? Date.now();
    const theme = options.theme;
    const sortedLimits = this.sortLimits(activeReport.limits);
    const activeBars: string[] = [];

    for (const l of sortedLimits) {
      const name = (l.id || l.window?.label || l.label || "").trim();
      const fraction = l.amount?.usedFraction ?? 0;
      const pct = Math.round(fraction * 100);
      const resetFormatted = l.window?.resetsAt ? formatReset(l.window.resetsAt, now) : "";
      const resetDisplay = theme ? theme.fg("muted", resetFormatted) : resetFormatted;
      const resetStr = resetFormatted ? ` 󰥔 ${resetDisplay}` : "";

      if (pct >= 100) {
        if (matchingReports.length <= 1) {
          const tag = `󰀪 [${name}: 100%${resetStr}]`;
          const tagDisplay = theme ? theme.fg("error", tag) : tag;
          activeBars.push(tagDisplay);
        }
        continue;
      }

      const { bar, pctStr, alertIcon } = render12Bar(fraction, theme);
      const barItem = `${alertIcon}${name} ${bar} ${pctStr}${resetStr}`;
      activeBars.push(barItem);
    }

    const prefixRaw = getProviderPrefix(provider);
    const prefix = theme ? theme.fg("accent", prefixRaw) : prefixRaw;
    const barsJoined = activeBars.join("  ");
    let result = `${prefix}  ${barsJoined}`;

    const poolTag = this.renderPoolSummary(provider, matchingReports, usageData, theme);
    if (poolTag) {
      result += `  ${poolTag}`;
    }

    const syncTag = formatSyncTime(options.fetchedAtMs, now);
    if (syncTag) {
      const syncDisplay = theme ? theme.fg("muted", syncTag) : syncTag;
      result += `  ${syncDisplay}`;
    }

    return result;
  }
}

export const RESOLVERS: ProviderQuotaResolver[] = [
  new OpenRouterResolver(),
  new GoogleAntigravityResolver(),
  new AnthropicResolver(),
  new OpenAIResolver(),
  new KimiResolver(),
  new DefaultResolver(),
];

export function getProviderPrefix(provider: string): string {
  const lower = provider.toLowerCase();
  switch (lower) {
    case "anthropic":
      return "󰛄 claude";
    case "openai-codex":
      return "󰚩 codex";
    case "openai":
      return "󰛄 openai";
    case "kimi-code":
    case "kimi":
    case "moonshot":
      return "󰍛 kimi";
    case "openrouter":
      return "󱚝 openrouter";
    case "google-antigravity":
    case "google":
    case "gemini":
    default:
      return "󰚩 antigravity";
  }
}

export function buildProviderSparklineString(
  provider: string,
  usageData: UsagePayload,
  now = Date.now(),
  fetchedAtMs?: number,
  theme?: ThemeLike,
  activeModel?: string,
): string {
  const resolver = RESOLVERS.find((r) => r.matches(provider)) || RESOLVERS[RESOLVERS.length - 1];
  const options: RenderOptions = {
    now,
    fetchedAtMs,
    theme,
    activeModel,
  };
  return resolver.resolve(provider, usageData, options);
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
    setWidget?(key: string, lines?: string[], options?: { placement?: string }): void;
    theme?: ThemeLike;
  };
  setInterval?(fn: () => void | Promise<void>, ms: number): unknown;
  setTimeout?(fn: () => void | Promise<void>, ms: number): unknown;
  clearTimer?(timer: unknown): void;
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
  }
  if (ctx.ui?.setWidget) {
    ctx.ui.setWidget("quota_status", undefined);
  }
}

export function setQuotaWidget(ctx: ExtensionContext, text: string): void {
  if (ctx.ui?.setWidget) {
    ctx.ui.setWidget("quota_status", [text], { placement: "belowEditor" });
  }
  if (ctx.ui?.setStatus) {
    ctx.ui.setStatus("quota_status", "");
  }
}

export const POLLING_INTERVAL_MS = 120_000; // 2 minutes

export type TimerHandle = NodeJS.Timeout | number | unknown;

let pollTimer: TimerHandle | null = null;
let modelWatcherTimer: TimerHandle | null = null;
let lastSeenModelName = "";

export function isPollTimerActive(): boolean {
  return pollTimer !== null;
}

export function clearPollTimer(ctx?: ExtensionContext | null): void {
  if (pollTimer !== null) {
    const effectiveCtx = ctx || lastCtx;
    if (effectiveCtx?.clearTimer) {
      effectiveCtx.clearTimer(pollTimer);
    } else {
      clearTimeout(pollTimer as NodeJS.Timeout);
    }
    pollTimer = null;
  }
}

export function resetCooldown(
  ctx?: ExtensionContext | null,
  onTick?: () => Promise<void> | void,
  intervalMs = POLLING_INTERVAL_MS,
): void {
  const effectiveCtx = ctx || lastCtx;
  if (!effectiveCtx || isSubagent(effectiveCtx)) return;

  clearPollTimer(effectiveCtx);

  const schedule = effectiveCtx.setTimeout
    ? effectiveCtx.setTimeout.bind(effectiveCtx)
    : (fn: () => void, ms: number) => setTimeout(fn, ms);

  pollTimer = schedule(async () => {
    try {
      if (onTick) {
        await onTick();
      }
    } finally {
      resetCooldown(effectiveCtx, onTick, intervalMs);
    }
  }, intervalMs);
}

export function checkModelChange(ctx: ExtensionContext): boolean {
  let modelName = "";
  if (ctx.models?.current) {
    const currentModel = ctx.models.current();
    modelName = normalizeModelSelector(currentModel);
  }
  if (!modelName && ctx.model) {
    modelName = normalizeModelSelector(ctx.model);
  }
  if (modelName && modelName !== lastSeenModelName) {
    lastSeenModelName = modelName;
    return true;
  }
  return false;
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
      const currentModel = effectiveCtx.models.current();
      modelName = normalizeModelSelector(currentModel);
    }
    if (!modelName && effectiveCtx.model) {
      modelName = normalizeModelSelector(effectiveCtx.model);
    }
    if (!modelName && effectiveCtx.sessionManager) {
      const sessionFile = effectiveCtx.sessionManager.getSessionFile();
      const latestModel = await getLatestModelFromSession(sessionFile);
      modelName = latestModel || "";
    }

    const modelParts = modelName.split("/");
    const providerKey = modelParts[0] || data.reports[0]?.provider || "";
    if (!providerKey) return;

    const matchingReport = data.reports.find((r) => r.provider === providerKey);
    const fetchedAtMs = matchingReport?.metadata?.fetchedAt;
    const now = Date.now();
    const theme = effectiveCtx.ui?.theme;

    const statusText = buildProviderSparklineString(
      providerKey,
      data,
      now,
      fetchedAtMs,
      theme,
      modelName,
    );

    if (statusText) {
      if (effectiveCtx.ui?.setWidget) {
        setQuotaWidget(effectiveCtx, statusText);
      } else if (effectiveCtx.ui?.setStatus) {
        setQuotaStatus(effectiveCtx, statusText);
      }
    } else {
      if (effectiveCtx.ui?.setWidget) {
        effectiveCtx.ui.setWidget("quota_status", undefined);
      }
      if (effectiveCtx.ui?.setStatus) {
        effectiveCtx.ui.setStatus("quota_status", "");
      }
    }
  }

  let isAgentActive = false;

  function armCooldown(ctx: ExtensionContext) {
    if (!isAgentActive) return;
    resetCooldown(ctx, async () => {
      if (isAgentActive) {
        await syncStatus(ctx, false);
      }
    }, POLLING_INTERVAL_MS);
  }

  pi.on("session_start", async (_event: unknown, ctx: ExtensionContext) => {
    checkModelChange(ctx);
    await syncStatus(ctx, false);
    clearPollTimer(ctx);

    if (modelWatcherTimer !== null) {
      if (ctx.clearTimer) {
        ctx.clearTimer(modelWatcherTimer);
      } else {
        clearInterval(modelWatcherTimer as NodeJS.Timeout);
      }
      modelWatcherTimer = null;
    }

    const intervalSchedule = ctx.setInterval
      ? ctx.setInterval.bind(ctx)
      : (fn: () => void, ms: number) => setInterval(fn, ms);

    modelWatcherTimer = intervalSchedule(async () => {
      const changed = checkModelChange(ctx);
      if (changed) {
        await syncStatus(ctx, false);
      }
    }, 1000);
  });

  pi.on("agent_start", async (_event: unknown, ctx: ExtensionContext) => {
    isAgentActive = true;
    checkModelChange(ctx);
    await syncStatus(ctx, false);
    armCooldown(ctx);
  });

  pi.on("turn_end", async (_event: unknown, ctx: ExtensionContext) => {
    if (!isAgentActive) return;
    checkModelChange(ctx);
    await syncStatus(ctx, false);
    armCooldown(ctx);
  });

  pi.on("agent_end", async (_event: unknown, ctx: ExtensionContext) => {
    isAgentActive = false;
    clearPollTimer(ctx);
    checkModelChange(ctx);
    await syncStatus(ctx, false);
  });

  pi.on("session_resume", async (_event: unknown, ctx: ExtensionContext) => {
    checkModelChange(ctx);
    await syncStatus(ctx, true);
    if (!isAgentActive) {
      clearPollTimer(ctx);
    }
  });

  pi.on("session_shutdown", (_event: unknown, ctx: ExtensionContext) => {
    isAgentActive = false;
    clearPollTimer(ctx);
    if (modelWatcherTimer !== null) {
      if (ctx.clearTimer) {
        ctx.clearTimer(modelWatcherTimer);
      } else {
        clearInterval(modelWatcherTimer as NodeJS.Timeout);
      }
      modelWatcherTimer = null;
    }
    if (ctx.ui?.setWidget) {
      ctx.ui.setWidget("quota_status", undefined);
    }
    if (ctx.ui?.setStatus) {
      ctx.ui.setStatus("quota_status", "");
    }
  });
}

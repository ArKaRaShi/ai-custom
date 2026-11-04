#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import {
  render12Bar,
  formatReset,
  formatSyncTime,
  getProviderPrefix,
  buildProviderSparklineString,
  getLatestModelFromSession,
  getActiveIdentityFromSession,
  setQuotaStatus,
  setQuotaWidget,
  normalizeModelSelector,
  resetCooldown,
  clearPollTimer,
  isPollTimerActive,
  checkModelChange,
  getActiveModelFamily,
  POLLING_INTERVAL_MS,
  type UsagePayload,
  type ExtensionContext,
} from "../../extensions/quota-status";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("given quota-status extension, when rendering usage sparklines and formatters, then format output correctly", () => {
  it("render12Bar renders correct 12-char Braille dot matrix segments and alert icons", () => {
    const zero = render12Bar(0);
    expect(zero.pctStr).toBe("0%");
    expect(zero.bar).toBe(`[${"⠀".repeat(12)}]`);
    expect(zero.alertIcon).toBe("");

    // 50%
    const half = render12Bar(0.5);
    expect(half.pctStr).toBe("50%");
    expect(half.bar).toBe(`[${"⣿".repeat(6)}${"⠀".repeat(6)}]`);
    expect(half.alertIcon).toBe("");

    // 65% triggers warning icon (▲)
    const warn = render12Bar(0.65);
    expect(warn.pctStr).toBe("65%");
    expect(warn.alertIcon).toBe("▲ ");

    // 90% triggers critical icon (󰀪)
    const crit = render12Bar(0.9);
    expect(crit.pctStr).toBe("90%");
    expect(crit.alertIcon).toBe("󰀪 ");

    // 100% full
    const full = render12Bar(1.0);
    expect(full.pctStr).toBe("100%");
    expect(full.bar).toBe(`[${"⣿".repeat(12)}]`);
    expect(full.alertIcon).toBe("󰀪 ");
  });

  it("formatReset correctly calculates hours, minutes, and days countdown with target reset time", () => {
    const fixedNow = new Date("2026-08-19T14:30:00").getTime();

    // 45 minutes ahead
    const resetIn45m = fixedNow + 45 * 60_000;
    expect(formatReset(resetIn45m, fixedNow)).toBe("45m @15:15");

    // 3 hours 15 minutes ahead
    const resetIn3h = fixedNow + (3 * 60 + 15) * 60_000;
    expect(formatReset(resetIn3h, fixedNow)).toBe("3h15m @17:45");

    // 2 days 4 hours ahead
    const resetIn2d = fixedNow + (2 * 1440 + 4 * 60) * 60_000;
    expect(formatReset(resetIn2d, fixedNow)).toBe("2d4h @Fri 18:30");

    // Elapsed / negative
    expect(formatReset(fixedNow - 1000, fixedNow)).toBe("0m");
    expect(formatReset(undefined, fixedNow)).toBe("");
  });

  it("getProviderPrefix returns correct icon and label", () => {
    expect(getProviderPrefix("anthropic")).toBe("󰛄 claude");
    expect(getProviderPrefix("openai-codex")).toBe("󰚩 codex");
    expect(getProviderPrefix("kimi")).toBe("󰍛 kimi");
    expect(getProviderPrefix("google-antigravity")).toBe("󰚩 antigravity");
    expect(getProviderPrefix("unknown-provider")).toBe("󰚩 antigravity");
  });

  it("buildProviderSparklineString applies Smart Focus for Antigravity and picks the active account", () => {
    const fixedNow = new Date("2026-08-19T12:00:00").getTime();
    const mockUsage: UsagePayload = {
      reports: [
        // Idle account
        {
          provider: "google-antigravity",
          limits: [
            {
              id: "weekly",
              label: "Usage (Google)",
              amount: { used: 70, usedFraction: 0.7 },
              window: { label: "Weekly", resetsAt: fixedNow + 5 * 3600_000 },
            },
            {
              id: "5h",
              label: "Usage (Google)",
              amount: { used: 0, usedFraction: 0.0 },
              window: { label: "5 Hour" },
            },
          ],
        },
        // Active account (takes priority)
        {
          provider: "google-antigravity",
          limits: [
            {
              id: "5h",
              label: "Usage (Google)",
              amount: { used: 40, usedFraction: 0.4 },
              window: { id: "5h", label: "5 Hour", resetsAt: fixedNow + 3 * 3600_000 },
            },
            {
              id: "weekly",
              label: "Usage (Google)",
              amount: { used: 12, usedFraction: 0.12 },
              window: { label: "Weekly" },
            },
            {
              id: "anthropic",
              label: "Usage (Anthropic)",
              amount: { used: 0, usedFraction: 0.0 },
              window: { label: "Weekly" },
            },
          ],
        },
      ],
      capacity: {
        "google-antigravity": [
          {
            window: "5h",
            accounts: 2,
            usedAccounts: 0.4,
            remainingAccounts: 1.6,
          },
        ],
      },
    };

    const output = buildProviderSparklineString("google-antigravity", mockUsage, fixedNow);
    expect(output).toContain("󰚩 antigravity");
    // Picks active 40% account
    expect(output).toContain("gemini 5h [");
    expect(output).toContain("40%");
    expect(output).toContain("󰥔 3h0m @15:00");
    // Pool capacity pill
    expect(output).toContain("[pool: 1.60× 5h · 2/2 usable · 0 limited]");
  });

  it("shows exhausted and available account counts instead of an exhausted account quota", () => {
    // given one exhausted account and one account with remaining 5h quota
    const mockUsage: UsagePayload = {
      reports: [
        {
          provider: "google-antigravity",
          limits: [{ id: "5h", amount: { usedFraction: 1 } }],
        },
        {
          provider: "google-antigravity",
          limits: [{ id: "5h", amount: { usedFraction: 0.31 } }],
        },
      ],
    };

    // when the provider status is rendered
    const output = buildProviderSparklineString("google-antigravity", mockUsage);

    // then the summary shows account availability without exposing 100% as provider-wide usage
    expect(output).toContain("[pool: 1/2 usable · 1 limited]");
    expect(output).not.toContain("100%");
  });

  it("renders one row per account and marks the active one", () => {
    // given one exhausted and one available OpenAI account with emails
    const mockUsage: UsagePayload = {
      reports: [
        { provider: "openai-codex", metadata: { provider: "openai-codex", email: "dead@mail.com" }, limits: [{ id: "5h", amount: { usedFraction: 1 } }] },
        { provider: "openai-codex", metadata: { provider: "openai-codex", email: "live@mail.com" }, limits: [{ id: "5h", amount: { usedFraction: 0.2 } }] },
      ],
    };

    // when the provider status is rendered
    const lines = buildProviderSparklineString("openai-codex", mockUsage).split("\n");

    // then the header keeps the pool tag and each account gets a row; the live one is active
    expect(lines[0]).toContain("[pool: 1/2 usable · 1 limited]");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("dead");
    expect(lines[1]).toContain("5h 100%");
    expect(lines[1].startsWith("▶")).toBe(false);
    expect(lines[2].startsWith("▶")).toBe(true);
    expect(lines[2]).toContain("live");
  });

  it("counts an account with an exhausted weekly window as exhausted and never picks it as active", () => {
    // given account A near-empty 5h but weekly at 100%, account B busier 5h but healthy
    const mockUsage: UsagePayload = {
      reports: [
        { provider: "anthropic", metadata: { provider: "anthropic", email: "weeklydead@mail.com" }, limits: [{ id: "5h", amount: { usedFraction: 0.15 } }, { id: "7d", amount: { usedFraction: 1 } }] },
        { provider: "anthropic", metadata: { provider: "anthropic", email: "healthy@mail.com" }, limits: [{ id: "5h", amount: { usedFraction: 0.12 } }, { id: "7d", amount: { usedFraction: 0.02 } }] },
      ],
      capacity: {
        anthropic: [{ window: "5h", accounts: 2, usedAccounts: 0.1, remainingAccounts: 1.9 }],
      },
    };

    // when the provider status is rendered
    const lines = buildProviderSparklineString("anthropic", mockUsage).split("\n");

    // then the 5h aggregate includes both accounts, while weekly exhaustion marks one unusable
    expect(lines[0]).toContain("[pool: 1.90× 5h · 1/2 usable · 1 limited]");
    expect(lines[1].startsWith("▶")).toBe(false);
    expect(lines[2].startsWith("▶")).toBe(true);
  });

  it("keeps monthly exhaustion generic in the pool summary", () => {
    const mockUsage: UsagePayload = {
      reports: [
        { provider: "anthropic", metadata: { provider: "anthropic", email: "monthlydead@mail.com" }, limits: [{ id: "5h", amount: { usedFraction: 0.15 } }, { id: "30d", amount: { usedFraction: 1 } }] },
        { provider: "anthropic", metadata: { provider: "anthropic", email: "healthy@mail.com" }, limits: [{ id: "5h", amount: { usedFraction: 0.12 } }, { id: "30d", amount: { usedFraction: 0.02 } }] },
      ],
      capacity: {
        anthropic: [{ window: "5h", accounts: 2, usedAccounts: 0.1, remainingAccounts: 1.9 }],
      },
    };

    const output = buildProviderSparklineString("anthropic", mockUsage);
    expect(output).toContain("[pool: 1.90× 5h · 1/2 usable · 1 limited]");
  });

  it("omits the multiplier when the provider has no 5h capacity entry", () => {
    const mockUsage: UsagePayload = {
      reports: [
        { provider: "anthropic", limits: [{ id: "5h", amount: { usedFraction: 0.15 } }] },
        { provider: "anthropic", limits: [{ id: "5h", amount: { usedFraction: 0.12 } }] },
      ],
      capacity: {
        anthropic: [{ window: "30d", accounts: 2, usedAccounts: 0.1, remainingAccounts: 1.9 }],
      },
    };

    const output = buildProviderSparklineString("anthropic", mockUsage);
    expect(output).toContain("[pool: 2/2 usable · 0 limited]");
    expect(output).not.toContain("1.90×");
  });

  it("buildProviderSparklineString renders multi-window for Claude", () => {
    const fixedNow = new Date("2026-08-19T12:00:00").getTime();
    const mockUsage: UsagePayload = {
      reports: [
        {
          provider: "anthropic",
          limits: [
            {
              id: "5h",
              label: "5-hour sliding window",
              amount: { used: 15, usedFraction: 0.15 },
              window: { durationMs: 18000000, resetsAt: fixedNow + 2 * 3600_000 },
            },
            {
              id: "7d",
              label: "7-day total quota",
              amount: { used: 85, usedFraction: 0.85 },
              window: { durationMs: 604800000, resetsAt: fixedNow + 3 * 86400_000 },
            },
          ],
        },
      ],
    };

    const output = buildProviderSparklineString("anthropic", mockUsage, fixedNow);
    expect(output).toContain("󰛄 claude");
    expect(output).toContain("5h [");
    expect(output).toContain("15%");
    expect(output).toContain("󰀪 7d [");
    expect(output).toContain("85%");
  });

  it("buildProviderSparklineString sorts Kimi windows chronologically (5h before 7d)", () => {
    const fixedNow = new Date("2026-08-19T12:00:00").getTime();
    const mockUsage: UsagePayload = {
      reports: [
        {
          provider: "kimi",
          limits: [
            {
              id: "7d",
              label: "7-day total quota",
              amount: { used: 50, usedFraction: 0.5 },
              window: { durationMs: 604800000 },
            },
            {
              id: "5h",
              label: "5-hour sliding window",
              amount: { used: 20, usedFraction: 0.2 },
              window: { durationMs: 18000000 },
            },
          ],
        },
      ],
    };

    const output = buildProviderSparklineString("kimi", mockUsage, fixedNow);
    expect(output).toContain("󰍛 kimi");
    const idx5h = output.indexOf("5h [");
    const idx7d = output.indexOf("7d [");
    expect(idx5h).toBeGreaterThan(-1);
    expect(idx7d).toBeGreaterThan(-1);
    expect(idx5h).toBeLessThan(idx7d);
  });

  it("buildProviderSparklineString formats openrouter pay-per-token tag and returns empty for untracked providers", () => {
    const mockUsage: UsagePayload = {
      reports: [
        {
          provider: "openrouter",
          limits: [],
        },
      ],
    };

    const openrouterOutput = buildProviderSparklineString("openrouter", mockUsage);
    expect(openrouterOutput).toBe("󱚝 openrouter  pay-per-token  (no fixed quota)");

    const untrackedOutput = buildProviderSparklineString("non-existent", mockUsage);
    expect(untrackedOutput).toBe("");
  });

  it("getLatestModelFromSession extracts the last model_change from session journal", async () => {
    const tmpSession = path.join(os.tmpdir(), `test-quota-model-${Date.now()}.jsonl`);
    const lines = [
      JSON.stringify({ type: "session_init", id: "001" }),
      JSON.stringify({ type: "model_change", model: "anthropic/claude-3-7-sonnet" }),
      JSON.stringify({ type: "message", role: "user", content: "test" }),
      JSON.stringify({ type: "model_change", model: "google-antigravity/gemini-3.7-flash" }),
    ];

    fs.writeFileSync(tmpSession, lines.join("\n"));
    try {
      const model = await getLatestModelFromSession(tmpSession);
      expect(model).toBe("google-antigravity/gemini-3.7-flash");
    } finally {
      if (fs.existsSync(tmpSession)) fs.unlinkSync(tmpSession);
    }
  });

  it("normalizeModelSelector handles diverse object shapes and string selectors", () => {
    expect(normalizeModelSelector("google-antigravity/gemini-3.7-flash")).toBe("google-antigravity/gemini-3.7-flash");
    expect(normalizeModelSelector({ id: "claude-3-7-sonnet", provider: "anthropic" })).toBe("anthropic/claude-3-7-sonnet");
    expect(normalizeModelSelector({ name: "claude-3-7-sonnet" })).toBe("claude-3-7-sonnet");
    expect(normalizeModelSelector(null)).toBe("");
    expect(normalizeModelSelector(undefined)).toBe("");
    expect(normalizeModelSelector(123)).toBe("");
  });

  it("render12Bar handles boundary fractions (negative, zero, 100%, and >100% overflow)", () => {
    const neg = render12Bar(-0.5);
    expect(neg.pctStr).toBe("-50%");
    expect(neg.bar).toBe(`[${"⠀".repeat(12)}]`);

    const over = render12Bar(1.5);
    expect(over.pctStr).toBe("150%");
    expect(over.bar).toBe(`[${"⣿".repeat(12)}]`);
    expect(over.alertIcon).toBe("󰀪 ");
  });

  it("buildProviderSparklineString handles empty or missing limits safely", () => {
    const emptyUsage: UsagePayload = { reports: [] };
    expect(buildProviderSparklineString("google-antigravity", emptyUsage)).toBe("");

    const noLimitsUsage: UsagePayload = {
      reports: [{ provider: "google-antigravity", limits: [] }],
    };
    expect(buildProviderSparklineString("google-antigravity", noLimitsUsage)).toBe("");
  });

  it("formatSyncTime formats exact local time and relative age correctly", () => {
    const fixedNow = new Date("2026-08-19T19:42:00").getTime();
    const justNowMs = fixedNow - 20_000;
    expect(formatSyncTime(justNowMs, fixedNow)).toBe("· 󰑐 19:41 (just now)");

    const minsAgoMs = fixedNow - 5 * 60_000;
    expect(formatSyncTime(minsAgoMs, fixedNow)).toBe("· 󰑐 19:37 (5m ago)");

    const hrsAgoMs = fixedNow - (2 * 60 + 10) * 60_000;
    expect(formatSyncTime(hrsAgoMs, fixedNow)).toBe("· 󰑐 17:32 (2h 10m ago)");
    expect(formatSyncTime(undefined, fixedNow)).toBe("");
  });

  it("buildProviderSparklineString appends sync timestamp tag when fetchedAtMs is provided", () => {
    const fixedNow = new Date("2026-08-19T12:00:00").getTime();
    const fetchedAt = fixedNow - 120_000;
    const mockUsage: UsagePayload = {
      reports: [
        {
          provider: "openai-codex",
          limits: [
            {
              id: "5h",
              amount: { used: 10, usedFraction: 0.1 },
              window: { durationMs: 18000000 },
            },
          ],
        },
      ],
    };

    const output = buildProviderSparklineString("openai-codex", mockUsage, fixedNow, fetchedAt);
    expect(output).toContain("󰚩 codex");
    expect(output).toContain("5h [");
    expect(output).toContain("10%");
    expect(output).toContain("· 󰑐 11:58 (2m ago)");
  });

  it("buildProviderSparklineString collapses 100% exhausted quota into a compact alert pill tag", () => {
    const fixedNow = new Date("2026-08-19T12:00:00").getTime();
    const mockUsage: UsagePayload = {
      reports: [
        {
          provider: "google-antigravity",
          limits: [
            {
              label: "Usage (Google)",
              amount: { used: 100, usedFraction: 1.0 },
              window: { label: "Daily", resetsAt: fixedNow + 3 * 3600_000 },
            },
            {
              label: "Usage (OpenAI)",
              amount: { used: 20, usedFraction: 0.2 },
              window: { label: "Daily", resetsAt: fixedNow + 3 * 3600_000 },
            },
          ],
        },
      ],
    };

    const output = buildProviderSparklineString("google-antigravity", mockUsage, fixedNow);
    expect(output).toContain("󰀪 [gemini 1d: 100% 󰥔 3h0m @15:00]");
    expect(output).toContain("openai 1d [");
  });

  it("setQuotaStatus updates status and clears widget, setQuotaWidget updates widget safely and clears status", () => {
    const statusCalls: Array<{ key: string; text: string }> = [];
    const widgetCalls: Array<{ key: string; lines: string[] | undefined; placement?: string }> = [];

    const dualCtx = {
      ui: {
        setStatus(key: string, text: string) {
          statusCalls.push({ key, text });
        },
        setWidget(key: string, lines?: string[], opts?: { placement?: string }) {
          widgetCalls.push({ key, lines, placement: opts?.placement });
        },
      },
    };

    setQuotaStatus(dualCtx, "󰚩 status 5h 42%");
    expect(statusCalls.length).toBe(1);
    expect(statusCalls[0].text).toBe("󰚩 status 5h 42%");
    expect(widgetCalls.length).toBe(1);
    expect(widgetCalls[0].lines).toBeUndefined();

    widgetCalls.length = 0;
    statusCalls.length = 0;
    setQuotaWidget(dualCtx, "󰚩 widget 5h 42%");
    expect(widgetCalls.length).toBe(1);
    expect(widgetCalls[0].lines).toEqual(["󰚩 widget 5h 42%"]);
    expect(widgetCalls[0].placement).toBe("belowEditor");
    expect(statusCalls.length).toBe(1);
    expect(statusCalls[0].text).toBe("");
  });

  it("render12Bar and buildProviderSparklineString apply theme color tokens when theme is provided", () => {
    const mockTheme = {
      fg(token: string, text: string) {
        return `<${token}>${text}</${token}>`;
      },
    };

    // <50%: success
    const low = render12Bar(0.3, mockTheme);
    expect(low.bar).toContain("<success>");
    expect(low.bar).toContain("<dim>");

    // 50-79%: accent
    const mid = render12Bar(0.7, mockTheme);
    expect(mid.bar).toContain("<accent>");

    // 80-99%: warning
    const high = render12Bar(0.85, mockTheme);
    expect(high.bar).toContain("<warning>");

    // 100%: error
    const full = render12Bar(1.0, mockTheme);
    expect(full.bar).toContain("<error>");

    // OpenRouter themed output
    const mockUsage: UsagePayload = { reports: [] };
    const orOutput = buildProviderSparklineString("openrouter", mockUsage, Date.now(), undefined, mockTheme);
    expect(orOutput).toBe("<accent>󱚝 openrouter</accent>  <muted>pay-per-token  (no fixed quota)</muted>");
  });
  it("resetCooldown and clearPollTimer manage timer reset and cooldown without wall-clock sleep", async () => {
    let scheduledFn: (() => Promise<void> | void) | null = null;
    let scheduledMs = 0;
    let clearedTimerHandle: unknown = null;
    let tickCount = 0;

    const mockCtx: ExtensionContext = {
      setTimeout(fn: () => Promise<void> | void, ms: number) {
        scheduledFn = fn;
        scheduledMs = ms;
        return "timer-handle-mock";
      },
      clearTimer(timer: unknown) {
        clearedTimerHandle = timer;
      },
    };

    expect(POLLING_INTERVAL_MS).toBe(120_000);

    // Arm timer
    resetCooldown(mockCtx, () => {
      tickCount++;
    });

    expect(isPollTimerActive()).toBe(true);
    expect(scheduledMs).toBe(120_000);
    expect(scheduledFn).not.toBeNull();

    // Simulate turn completion resetting cooldown: old timer cleared and new one scheduled
    resetCooldown(mockCtx, () => {
      tickCount++;
    });
    expect(clearedTimerHandle).toBe("timer-handle-mock");
    expect(isPollTimerActive()).toBe(true);

    // Invoke scheduled callback directly to test tick execution and re-arming
    if (scheduledFn) {
      await (scheduledFn as () => Promise<void>)();
    }
    expect(tickCount).toBe(1);

    // Shutdown / cleanup
    clearPollTimer(mockCtx);
    expect(isPollTimerActive()).toBe(false);
  });

  it("Option 2: GoogleAntigravityResolver focuses on active model and collapses other weekly quotas", () => {
    const fixedNow = new Date("2026-08-19T12:00:00").getTime();
    const mockUsage: UsagePayload = {
      reports: [
        {
          provider: "google-antigravity",
          limits: [
            {
              id: "5h",
              label: "5 Hour",
              amount: { used: 4, usedFraction: 0.04 },
              window: { durationMs: 18000000, resetsAt: fixedNow + 18 * 60_000 },
            },
            {
              id: "google-antigravity:anthropic:default:3p-weekly",
              label: "3p-weekly",
              amount: { used: 47, usedFraction: 0.47 },
              window: { durationMs: 604800000, resetsAt: fixedNow + 5 * 86400_000 },
            },
            {
              id: "google-antigravity:openai:default:3p-weekly",
              label: "3p-weekly",
              amount: { used: 47, usedFraction: 0.47 },
              window: { durationMs: 604800000, resetsAt: fixedNow + 5 * 86400_000 },
            },
            {
              id: "google-antigravity:google:default:gemini-weekly",
              label: "gemini-weekly",
              amount: { used: 31, usedFraction: 0.31 },
              window: { durationMs: 604800000, resetsAt: fixedNow + 2 * 86400_000 },
            },
          ],
        },
      ],
    };

    // When Gemini is active
    const geminiOutput = buildProviderSparklineString(
      "google-antigravity",
      mockUsage,
      fixedNow,
      undefined,
      undefined,
      "google-antigravity/gemini-3.8-flash",
    );
    expect(geminiOutput).toContain("5h [");
    expect(geminiOutput).toContain("gemini [");
    expect(geminiOutput).not.toContain("google-antigravity:anthropic");
    expect(geminiOutput).not.toContain("(: 0%)");
    expect(geminiOutput).toContain("(claude: 47% · openai: 47%)");

    // When Claude is active
    const claudeOutput = buildProviderSparklineString(
      "google-antigravity",
      mockUsage,
      fixedNow,
      undefined,
      undefined,
      "google-antigravity/claude-3-7-sonnet",
    );
    expect(claudeOutput).toContain("5h [");
    expect(claudeOutput).toContain("claude [");
    expect(claudeOutput).toContain("(openai: 47% · gemini: 31%)");
  });

  it("checkModelChange detects model switch immediately", () => {
    let currentModelName = "google-antigravity/gemini-3.8-flash";
    const ctx: ExtensionContext = {
      models: {
        current() {
          return currentModelName;
        },
      },
    };

    const firstCheck = checkModelChange(ctx);
    expect(firstCheck).toBe(true);

    const secondCheck = checkModelChange(ctx);
    expect(secondCheck).toBe(false);

    // Switch model
    currentModelName = "google-antigravity/claude-3-7-sonnet";
    const switchedCheck = checkModelChange(ctx);
    expect(switchedCheck).toBe(true);
  });
});

describe("given multiple accounts, when the real active credential is known", () => {
  const usage: UsagePayload = {
    reports: [
      { provider: "anthropic", metadata: { provider: "anthropic", email: "busy@mail.com", orgId: "o1" }, limits: [{ id: "5h", amount: { usedFraction: 0.5 } }] },
      { provider: "anthropic", metadata: { provider: "anthropic", email: "idle@mail.com", orgId: "o2" }, limits: [{ id: "5h", amount: { usedFraction: 0.1 } }] },
    ],
  };

  it("marks the account matching the identity, overriding the heuristic", () => {
    // heuristic alone would pick the busier account
    const heuristic = buildProviderSparklineString("anthropic", usage).split("\n");
    expect(heuristic[1].startsWith("▶")).toBe(true);

    const real = buildProviderSparklineString("anthropic", usage, Date.now(), undefined, undefined, "", "email:idle@mail.com|org:o2").split("\n");
    expect(real[1].startsWith("▶")).toBe(false);
    expect(real[2].startsWith("▶")).toBe(true);
  });

  it("does not match an identity whose org differs even if the email is the same", () => {
    const output = buildProviderSparklineString("anthropic", usage, Date.now(), undefined, undefined, "", "email:idle@mail.com|org:other").split("\n");
    // falls back to heuristic (busy account)
    expect(output[1].startsWith("▶")).toBe(true);
  });

  it("heuristic skips accounts inside the 10% reserve on any window", () => {
    const reserve: UsagePayload = {
      reports: [
        { provider: "anthropic", metadata: { provider: "anthropic", email: "weekly99@mail.com" }, limits: [{ id: "5h", amount: { usedFraction: 0.3 } }, { id: "7d", amount: { usedFraction: 0.99 } }] },
        { provider: "anthropic", metadata: { provider: "anthropic", email: "healthy@mail.com" }, limits: [{ id: "5h", amount: { usedFraction: 0.1 } }, { id: "7d", amount: { usedFraction: 0.02 } }] },
      ],
    };
    const lines = buildProviderSparklineString("anthropic", reserve).split("\n");
    expect(lines[1].startsWith("▶")).toBe(false);
    expect(lines[2].startsWith("▶")).toBe(true);
  });

  it("getActiveIdentityFromSession resolves the newest assistant credentialId via agent.db", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quota-id-"));
    try {
      const dbPath = path.join(dir, "agent.db");
      const { Database } = require("bun:sqlite");
      const db = new Database(dbPath);
      db.run("CREATE TABLE auth_credentials (id INTEGER PRIMARY KEY, provider TEXT, identity_key TEXT)");
      db.run("INSERT INTO auth_credentials VALUES (1,'anthropic','email:a@x|org:1'),(2,'anthropic','email:b@x|org:2')");
      db.close();
      const sessionFile = path.join(dir, "s.jsonl");
      const rec = (cid: number, provider: string) => JSON.stringify({ type: "message", message: { role: "assistant", provider, credentialId: cid } });
      fs.writeFileSync(sessionFile, [rec(1, "anthropic"), rec(2, "anthropic"), rec(1, "openai")].join("\n"));

      expect(getActiveIdentityFromSession(sessionFile, "anthropic", dbPath)).toBe("email:b@x|org:2");
      expect(getActiveIdentityFromSession(sessionFile, "kimi", dbPath)).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("antigravity: exhausted depends on the active model family, not the worst limit", () => {
    const lim = (id: string, u: number) => ({ id: `google-antigravity:${id}`, amount: { usedFraction: u } });
    const ag: UsagePayload = {
      reports: [
        { provider: "google-antigravity", metadata: { provider: "google-antigravity", email: "alldead@mail.com" }, limits: [lim("google:default:gemini-weekly", 1), lim("anthropic:default:3p-weekly", 1)] },
        { provider: "google-antigravity", metadata: { provider: "google-antigravity", email: "geminiok@mail.com" }, limits: [lim("anthropic:default:3p-5h", 1), lim("google:default:gemini-5h", 0.17)] },
      ],
    };

    const gemini = buildProviderSparklineString("google-antigravity", ag, Date.now(), undefined, undefined, "google-antigravity/gemini-3.8-flash").split("\n");
    expect(gemini[0]).toContain("1/2 usable · 1 limited");
    expect(gemini[2].startsWith("▶")).toBe(true);

    const claude = buildProviderSparklineString("google-antigravity", ag, Date.now(), undefined, undefined, "google-antigravity/claude-sonnet").split("\n");
    expect(claude[0]).toContain("0/2 usable · 2 limited");
  });
});

#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import {
  render12Bar,
  formatReset,
  formatSyncTime,
  getProviderPrefix,
  buildProviderSparklineString,
  getLatestModelFromSession,
  setQuotaStatus,
  setQuotaWidget,
  normalizeModelSelector,
  type UsagePayload,
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

  it("buildProviderSparklineString applies Smart Focus for Antigravity", () => {
    const fixedNow = new Date("2026-08-19T12:00:00").getTime();
    const mockUsage: UsagePayload = {
      reports: [
        {
          provider: "google-antigravity",
          limits: [
            {
              label: "Usage (Google)",
              amount: { used: 42, usedFraction: 0.42 },
              window: { label: "Daily", resetsAt: fixedNow + 5 * 3600_000 },
            },
            {
              label: "Usage (OpenAI)",
              amount: { used: 0, usedFraction: 0.0 },
              window: { label: "Daily" },
            },
            {
              label: "Usage (Anthropic)",
              amount: { used: 0, usedFraction: 0.0 },
              window: { label: "Daily" },
            },
          ],
        },
      ],
    };

    const output = buildProviderSparklineString("google-antigravity", mockUsage, fixedNow);
    expect(output).toContain("󰚩 antigravity");
    expect(output).toContain("gemini 1d [");
    expect(output).toContain("42%");
    expect(output).toContain("󰥔 5h0m @17:00");
    expect(output).toContain("(openai: 0% · claude: 0%)");
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

  it("buildProviderSparklineString returns empty string for unmetered/untracked providers", () => {
    const mockUsage: UsagePayload = {
      reports: [
        {
          provider: "openrouter",
          limits: [],
        },
      ],
    };

    expect(buildProviderSparklineString("openrouter", mockUsage)).toBe("");
    expect(buildProviderSparklineString("non-existent", mockUsage)).toBe("");
  });

  it("buildProviderSparklineString expands multiple non-zero Antigravity backends", () => {
    const fixedNow = new Date("2026-08-19T12:00:00").getTime();
    const mockUsage: UsagePayload = {
      reports: [
        {
          provider: "google-antigravity",
          limits: [
            {
              label: "Usage (Google)",
              amount: { used: 42, usedFraction: 0.42 },
              window: { label: "Daily", resetsAt: fixedNow + 5 * 3600_000 },
            },
            {
              label: "Usage (OpenAI)",
              amount: { used: 18, usedFraction: 0.18 },
              window: { label: "Daily", resetsAt: fixedNow + 3 * 3600_000 },
            },
            {
              label: "Usage (Anthropic)",
              amount: { used: 0, usedFraction: 0.0 },
              window: { label: "Daily" },
            },
          ],
        },
      ],
    };

    const output = buildProviderSparklineString("google-antigravity", mockUsage, fixedNow);
    expect(output).toContain("gemini 1d [");
    expect(output).toContain("42%");
    expect(output).toContain("openai 1d [");
    expect(output).toContain("18%");
    expect(output).toContain("(claude: 0%)");
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

  it("getLatestModelFromSession handles non-string or object model in session journal", async () => {
    const tmpSession = path.join(os.tmpdir(), `test-quota-obj-${Date.now()}.jsonl`);
    const lines = [
      JSON.stringify({ type: "session_init", id: "001" }),
      JSON.stringify({ type: "model_change", model: { id: "gemini-3.7-flash", provider: "google" } }),
    ];

    fs.writeFileSync(tmpSession, lines.join("\n"));
    try {
      const model = await getLatestModelFromSession(tmpSession);
      expect(model).toBe("google/gemini-3.7-flash");
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

  it("setQuotaStatus and setQuotaWidget update status and widget on context safely", () => {
    const statusCalls: Array<{ key: string; text: string }> = [];
    const widgetCalls: Array<{ key: string; lines: string[]; placement?: string }> = [];

    const statusCtx = {
      ui: {
        setStatus(key: string, text: string) {
          statusCalls.push({ key, text });
        },
      },
    };

    const widgetCtx = {
      ui: {
        setWidget(key: string, lines: string[], opts?: { placement?: string }) {
          widgetCalls.push({ key, lines, placement: opts?.placement });
        },
      },
    };

    setQuotaStatus(statusCtx, "󰚩 status 5h 42%");
    expect(statusCalls.length).toBe(1);
    expect(statusCalls[0].text).toBe("󰚩 status 5h 42%");

    setQuotaWidget(widgetCtx, "󰚩 widget 5h 42%");
    expect(widgetCalls.length).toBe(1);
    expect(widgetCalls[0].lines).toEqual(["󰚩 widget 5h 42%"]);
    expect(widgetCalls[0].placement).toBe("belowEditor");
  });
});

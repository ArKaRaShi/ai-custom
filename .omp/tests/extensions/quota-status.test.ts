#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import {
  render12Bar,
  formatReset,
  formatSyncTime,
  getProviderPrefix,
  buildProviderSparklineString,
  getLatestModelFromSession,
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

    // 16% (1 full + sub-dot + 10 blanks = 12)
    const mid = render12Bar(0.16);
    expect(mid.pctStr).toBe("16%");
    expect(mid.bar).toBe(`[⣿⣷${"⠀".repeat(10)}]`);
    expect(mid.alertIcon).toBe("");

    // 60% warning (7 full + ⣀ + 4 blanks = 12, ▲ icon)
    const warn = render12Bar(0.6);
    expect(warn.pctStr).toBe("60%");
    expect(warn.bar).toBe(`[${"⣿".repeat(7)}⣀${"⠀".repeat(4)}]`);
    expect(warn.alertIcon).toBe("▲ ");
    // 98% danger (11 full + ⣶ = 12, 󰀪 alert icon)
    const crit = render12Bar(0.98);
    expect(crit.pctStr).toBe("98%");
    expect(crit.bar).toBe(`[${"⣿".repeat(11)}⣶]`);
    expect(crit.alertIcon).toBe("󰀪 ");
  });

  it("formatReset correctly calculates hours, minutes, and days countdown with target reset time", () => {
    const fixedNow = new Date("2026-08-19T12:00:00").getTime();
    // 4 hours 47 mins in future -> 16:47
    const reset4h47m = fixedNow + (4 * 3600 + 47 * 60) * 1000;
    expect(formatReset(reset4h47m, fixedNow)).toBe("4h47m @16:47");

    // 3 days 16 hours -> Sun 04:00
    const reset3d = fixedNow + (3 * 24 + 16) * 3600 * 1000;
    expect(formatReset(reset3d, fixedNow)).toBe("3d16h @Sun 04:00");

    // 42 minutes in future -> 12:42
    const reset42m = fixedNow + 42 * 60 * 1000;
    expect(formatReset(reset42m, fixedNow)).toBe("42m @12:42");

    // Elapsed / negative
    expect(formatReset(fixedNow - 1000, fixedNow)).toBe("0m");
  });

  it("getProviderPrefix returns correct icon and label", () => {
    expect(getProviderPrefix("anthropic")).toBe("󰛄 claude");
    expect(getProviderPrefix("openai-codex")).toBe("󰚩 codex");
    expect(getProviderPrefix("kimi-code")).toBe("󰍛 kimi");
    expect(getProviderPrefix("google-antigravity")).toBe("󰚩 antigravity");
  });

  it("buildProviderSparklineString applies Smart Focus for Antigravity", () => {
    const mockUsage: UsagePayload = {
      reports: [
        {
          provider: "google-antigravity",
          limits: [
            {
              label: "Usage (Google)",
              amount: { used: 16, usedFraction: 0.16 },
              window: { label: "Daily", resetsAt: 1787160000000 },
            },
            {
              label: "Usage (OpenAI)",
              amount: { used: 0, usedFraction: 0 },
              window: { label: "Daily", resetsAt: 1787160000000 },
            },
            {
              label: "Usage (Anthropic)",
              amount: { used: 0, usedFraction: 0 },
              window: { label: "Daily", resetsAt: 1787160000000 },
            },
          ],
        },
      ],
    };

    const output = buildProviderSparklineString("google-antigravity", mockUsage, 1787140000000);
    expect(output).toContain(`gemini 1d [⣿⣷${"⠀".repeat(10)}] 16%`);
    expect(output).toContain("(openai: 0% · claude: 0%)");
  });

  it("buildProviderSparklineString renders multi-window for Claude", () => {
    const mockUsage: UsagePayload = {
      reports: [
        {
          provider: "anthropic",
          limits: [
            {
              label: "Claude 5 Hour",
              amount: { used: 1, usedFraction: 0.01 },
              window: { label: "5 Hour", resetsAt: 1787160000000 },
            },
            {
              label: "Claude 7 Day",
              amount: { used: 98, usedFraction: 0.98 },
              window: { label: "7 Day", resetsAt: 1787170000000 },
            },
          ],
        },
      ],
    };
    const output = buildProviderSparklineString("anthropic", mockUsage, 1787140000000);
    expect(output).toContain("󰛄 claude");
    expect(output).toContain(`5h [⡀${"⠀".repeat(11)}] 1%`);
    expect(output).toContain(`󰀪 7d [${"⣿".repeat(11)}⣶] 98%`);
  });
  it("buildProviderSparklineString sorts Kimi windows chronologically (5h before 7d)", () => {
    const mockUsage: UsagePayload = {
      reports: [
        {
          provider: "kimi-code",
          limits: [
            {
              label: "Total quota",
              amount: { used: 59, usedFraction: 0.59 },
              window: { label: "7 Day", resetsAt: 1787460000000 },
            },
            {
              label: "5h limit",
              amount: { used: 0, usedFraction: 0 },
              window: { label: "5h limit", durationMs: 18000000, resetsAt: 1787150000000 },
            },
          ],
        },
      ],
    };

    const output = buildProviderSparklineString("kimi-code", mockUsage, 1787140000000);
    expect(output).toContain("󰍛 kimi");
    // 5h must come before 7d
    const idx5h = output.indexOf("5h");
    const idx7d = output.indexOf("7d");
    expect(idx5h).toBeGreaterThan(-1);
    expect(idx7d).toBeGreaterThan(-1);
    expect(idx5h).toBeLessThan(idx7d);
  });
  it("buildProviderSparklineString returns empty string for unmetered/untracked providers", () => {
    const mockUsage: UsagePayload = {
      reports: [
        {
          provider: "google-antigravity",
          limits: [
            {
              label: "Usage (Google)",
              amount: { used: 16, usedFraction: 0.16 },
              window: { label: "Daily", resetsAt: 1787160000000 },
            },
          ],
        },
      ],
    };

    // OpenRouter has no entry in reports -> returns empty string (silent hide)
    const output = buildProviderSparklineString("openrouter", mockUsage, 1787140000000);
    expect(output).toBe("");
  });

  it("buildProviderSparklineString expands multiple non-zero Antigravity backends", () => {
    const mockUsage: UsagePayload = {
      reports: [
        {
          provider: "google-antigravity",
          limits: [
            {
              label: "Usage (Google)",
              amount: { used: 25, usedFraction: 0.25 },
              window: { label: "Daily", resetsAt: 1787160000000 },
            },
            {
              label: "Usage (OpenAI)",
              amount: { used: 40, usedFraction: 0.4 },
              window: { label: "Daily", resetsAt: 1787160000000 },
            },
            {
              label: "Usage (Anthropic)",
              amount: { used: 0, usedFraction: 0 },
              window: { label: "Daily", resetsAt: 1787160000000 },
            },
          ],
        },
      ],
    };

    const output = buildProviderSparklineString("google-antigravity", mockUsage, 1787140000000);
    // Both Google and OpenAI expand into full bars
    expect(output).toContain("gemini 1d [");
    expect(output).toContain("25%");
    expect(output).toContain("openai 1d [");
    expect(output).toContain("40%");
    // Only idle Claude stays in parens
    expect(output).toContain("(claude: 0%)");
  });

  it("getLatestModelFromSession extracts the last model_change from session journal", async () => {
    const tmpSession = path.join(os.tmpdir(), `test-session-${Date.now()}.jsonl`);
    const lines = [
      JSON.stringify({ type: "session", id: "s1" }),
      JSON.stringify({ type: "model_change", model: "anthropic/claude-haiku-4-5" }),
      JSON.stringify({ type: "message", message: { role: "user", content: "hello" } }),
      JSON.stringify({ type: "model_change", model: "anthropic/claude-opus-5" }),
    ].join("\n");

    fs.writeFileSync(tmpSession, lines);
    const latestModel = await getLatestModelFromSession(tmpSession);
    fs.unlinkSync(tmpSession);

    expect(latestModel).toBe("anthropic/claude-opus-5");
  });

  it("getLatestModelFromSession handles non-string or object model in session journal", async () => {
    const tmpSession = path.join(os.tmpdir(), `test-session-obj-${Date.now()}.jsonl`);
    const lines = [
      JSON.stringify({ type: "session", id: "s1" }),
      JSON.stringify({ type: "model_change", model: { id: "openai-codex/gpt-5.6-terra" } }),
    ].join("\n");

    fs.writeFileSync(tmpSession, lines);
    const latestModel = await getLatestModelFromSession(tmpSession);
    fs.unlinkSync(tmpSession);

    expect(latestModel).toBe("openai-codex/gpt-5.6-terra");
  });

  it("render12Bar handles boundary fractions (negative, zero, 100%, and >100% overflow)", () => {
    // Negative fraction clamped to 0%
    const neg = render12Bar(-0.5);
    expect(neg.pctStr).toBe("-50%");
    expect(neg.bar).toBe(`[${"⠀".repeat(12)}]`);

    // 100% full
    const full = render12Bar(1.0);
    expect(full.pctStr).toBe("100%");
    expect(full.bar).toBe(`[${"⣿".repeat(12)}]`);
    expect(full.alertIcon).toBe("󰀪 ");

    // 150% overflow clamped to max 12 blocks
    const over = render12Bar(1.5);
    expect(over.pctStr).toBe("150%");
    expect(over.bar).toBe(`[${"⣿".repeat(12)}]`);
    expect(over.alertIcon).toBe("󰀪 ");
  });

  it("buildProviderSparklineString handles empty or missing limits safely", () => {
    const emptyUsage: UsagePayload = {
      reports: [
        {
          provider: "anthropic",
          limits: [],
        },
      ],
    };

    expect(buildProviderSparklineString("anthropic", emptyUsage)).toBe("");
    expect(buildProviderSparklineString("non-existent", { reports: [] })).toBe("");
  });

  it("formatSyncTime formats exact local time and relative age correctly", () => {
    const fixedNow = new Date("2026-08-19T19:42:00").getTime();

    // Just now (< 1 min)
    const justNowMs = fixedNow - 20_000;
    const resJustNow = formatSyncTime(justNowMs, fixedNow);
    expect(resJustNow).toBe("· 󰑐 19:41 (just now)");

    // 2 minutes ago
    const twoMinsMs = fixedNow - 2 * 60_000;
    const resTwoMins = formatSyncTime(twoMinsMs, fixedNow);
    expect(resTwoMins).toBe("· 󰑐 19:40 (2m ago)");

    // 1 hour 15 minutes ago
    const hourMs = fixedNow - (75 * 60_000);
    const resHour = formatSyncTime(hourMs, fixedNow);
    expect(resHour).toBe("· 󰑐 18:27 (1h 15m ago)");

    // Empty when no timestamp provided
    expect(formatSyncTime(undefined, fixedNow)).toBe("");
  });

  it("buildProviderSparklineString appends sync timestamp tag when fetchedAtMs is provided", () => {
    const fixedNow = new Date("2026-08-19T19:42:00").getTime();
    const fetchedAt = fixedNow - 2 * 60_000; // 19:40
    const mockUsage: UsagePayload = {
      reports: [
        {
          provider: "anthropic",
          limits: [
            {
              label: "Usage",
              amount: { used: 5, usedFraction: 0.05 },
              window: { label: "5 Hour", resetsAt: fixedNow + 3600_000 },
            },
          ],
        },
      ],
    };

    const output = buildProviderSparklineString("anthropic", mockUsage, fixedNow, fetchedAt);
    expect(output).toContain("󰑐 19:40 (2m ago)");
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
});

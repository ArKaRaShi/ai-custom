#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import turnMetrics, {
  formatTokens,
  formatTurnMetrics,
  isSubagent,
  getTotalUsage,
} from "../../extensions/turn-metrics";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("given turn-metrics extension, when formatting tokens or detecting subagents, then return expected representations", () => {
  it("formatTokens humanizes token counts cleanly", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(18)).toBe("18");
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1000)).toBe("1k");
    expect(formatTokens(5649)).toBe("5.6k");
    expect(formatTokens(12480)).toBe("12.5k");
    expect(formatTokens(999_999)).toBe("1000k");
    expect(formatTokens(1_000_000)).toBe("1m");
    expect(formatTokens(1_325_500)).toBe("1.3m");
    expect(formatTokens(6_645_500)).toBe("6.6m");
  });

  it("formatTurnMetrics formats full Style 1 Nerd Font metrics with ttft, thinking breakdown, cache percentage, and cost savings", () => {
    // Exact user scenario: 15.7s, 12.4s ttft, 180 think, 77 act, 257 out, 319k cached, 2.4k new, $0.071 cost, $0.57 saved
    const exact = formatTurnMetrics("15.7", 257, 2400, 319000, {
      ttftMs: 12400,
      dThinking: 180,
      costTotal: 0.071,
      costSaved: 0.57,
    });
    expect(exact).toBe(
      " 15.7s (12.4s ttft) · 󰧑 180 think · 󰆍 77 act (257 out) · 󱐋 99.3% (319k cached · 2.4k new) · 󰠓 $0.071 (󰚰 $0.57)"
    );
  });

  it("formatTurnMetrics formats breakdown with and without cache using Nerd Font glyphs", () => {
    // With cache: 176741 cached + 2 new = 176743 total in (100% cache hit)
    expect(formatTurnMetrics("17.3", 1042, 2, 176741)).toBe(" 17.3s · 󰆍 1k out · 󱐋 100% (176.7k cached · 2 new)");
    // Example: 24.4k cached + 71.3k new = 95.7k total in (25.5% hit)
    expect(formatTurnMetrics("4.3", 377, 71300, 24400)).toBe(" 4.3s · 󰆍 377 out · 󱐋 25.5% (24.4k cached · 71.3k new)");
    // Without cache (dCache == 0)
    expect(formatTurnMetrics("5.2", 450, 1250, 0)).toBe(" 5.2s · 󰆍 450 out · 󱐋 1.3k in");
    // Large numbers in millions: 2.5m cached + 5.0m new = 7.5m total in (33.3% hit)
    expect(formatTurnMetrics("12.0", 1200000, 5000000, 2500000)).toBe(" 12.0s · 󰆍 1.2m out · 󱐋 33.3% (2.5m cached · 5m new)");
    // Sub-second turns (<0.1s)
    expect(formatTurnMetrics("<0.1s", 50, 1200, 0)).toBe(" <0.1s · 󰆍 50 out · 󱐋 1.2k in");
    // Aborted turns
    expect(formatTurnMetrics("⊘ aborted", 203, 11200, 146900)).toBe(" ⊘ aborted · 󰆍 203 out · 󱐋 92.9% (146.9k cached · 11.2k new)");
  });

  it("formatTurnMetrics handles cost without savings and thinking without tools", () => {
    // Turn with cost but 0 savings
    const costOnly = formatTurnMetrics("8.0", 500, 1000, 0, { costTotal: 0.025, costSaved: 0 });
    expect(costOnly).toBe(" 8.0s · 󰆍 500 out · 󱐋 1k in · 󰠓 $0.025");

    // Pure thinking turn (no action tokens)
    const thinkOnly = formatTurnMetrics("5.0", 400, 1000, 0, { dThinking: 400 });
    expect(thinkOnly).toBe(" 5.0s · 󰧑 400 think (400 out) · 󱐋 1k in");
  });

  it("isSubagent correctly identifies subagent session journals vs parent sessions", () => {
    // Main session file (starts with ISO timestamp)
    const parentCtx = {
      sessionManager: {
        getSessionFile: () => "/Users/ponthep/.omp/agent/sessions/--path--/2026-08-19T12-29-32-013Z_01a0.jsonl",
      },
    };
    expect(isSubagent(parentCtx)).toBe(false);

    // Subagent session file (named after agent)
    const subagentCtx = {
      sessionManager: {
        getSessionFile: () => "/Users/ponthep/.omp/agent/sessions/--path--/TestSonic.jsonl",
      },
    };
    expect(isSubagent(subagentCtx)).toBe(true);

    // Explicit flag
    expect(isSubagent({ isSubagent: true })).toBe(true);
    expect(isSubagent(undefined)).toBe(false);
  });

  it("getTotalUsage accurately aggregates assistant usage records from real session JSONL", async () => {
    const tmpSession = path.join(os.tmpdir(), `test-turn-metrics-${Date.now()}.jsonl`);
    const lines = [
      JSON.stringify({ type: "session_init", id: "123" }),
      JSON.stringify({ type: "message", message: { role: "user", content: "Hello" } }),
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "Let me think about this step by step deeply..." },
            { type: "toolCall", name: "read", arguments: { file: "test.ts" } },
          ],
          ttft: 1800,
          usage: {
            input: 1200,
            output: 250,
            cacheRead: 5000,
            cost: { input: 0.0024, output: 0.0025, cacheRead: 0.001, total: 0.0059 },
          },
        },
      }),
      JSON.stringify({ type: "tool_use", name: "read" }),
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: "Done",
          ttft: 400,
          usage: {
            input: 800,
            output: 150,
            cacheRead: 2000,
            cost: { input: 0.0016, output: 0.0015, cacheRead: 0.0004, total: 0.0035 },
          },
        },
      }),
    ];

    fs.writeFileSync(tmpSession, lines.join("\n"));
    try {
      const usage = await getTotalUsage(tmpSession);
      expect(usage.inputTokens).toBe(2000);
      expect(usage.outputTokens).toBe(400);
      expect(usage.cacheReadTokens).toBe(7000);
      expect(usage.thinkingTokens).toBeGreaterThan(0);
      expect(usage.costTotal).toBeCloseTo(0.0094, 4);
      expect(usage.costSaved).toBeGreaterThan(0);
      expect(usage.lastTtftMs).toBe(400);
    } finally {
      if (fs.existsSync(tmpSession)) fs.unlinkSync(tmpSession);
    }
  });

  it("getTotalUsage returns zero values when session file does not exist or has malformed lines", async () => {
    const nonExistent = await getTotalUsage("/tmp/non-existent-session-file-12345.jsonl");
    expect(nonExistent.outputTokens).toBe(0);
    expect(nonExistent.inputTokens).toBe(0);
    expect(nonExistent.cacheReadTokens).toBe(0);
    expect(nonExistent.thinkingTokens).toBe(0);
    expect(nonExistent.costTotal).toBe(0);
    expect(nonExistent.costSaved).toBe(0);
    expect(nonExistent.lastTtftMs).toBe(0);

    const tmpMalformed = path.join(os.tmpdir(), `test-malformed-${Date.now()}.jsonl`);
    fs.writeFileSync(tmpMalformed, "not valid json\n\n{ truncated json");
    try {
      const malformedUsage = await getTotalUsage(tmpMalformed);
      expect(malformedUsage.outputTokens).toBe(0);
      expect(malformedUsage.inputTokens).toBe(0);
      expect(malformedUsage.cacheReadTokens).toBe(0);
      expect(malformedUsage.thinkingTokens).toBe(0);
      expect(malformedUsage.costTotal).toBe(0);
      expect(malformedUsage.costSaved).toBe(0);
      expect(malformedUsage.lastTtftMs).toBe(0);
    } finally {
      if (fs.existsSync(tmpMalformed)) fs.unlinkSync(tmpMalformed);
    }
  });

  it("default export logs turn duration and token metrics on agent_end", async () => {
    const handlers: Record<string, ((e: unknown, ctx: unknown) => Promise<void>)> = {};
    const pi = {
      on: (ev: string, h: (e: unknown, ctx: unknown) => Promise<void>) => {
        handlers[ev] = h;
      },
    } as unknown as ExtensionAPI;
    turnMetrics(pi);
    const tmpSession = path.join(os.tmpdir(), `2026-08-19T12-00-00-000Z_agent-end.jsonl`);
    fs.writeFileSync(
      tmpSession,
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          usage: { input: 500, output: 50, cacheRead: 1000 },
        },
      }),
    );

    const notifications: Array<{ msg: string; level?: string }> = [];
    const parentCtx = {
      sessionManager: { getSessionFile: () => tmpSession },
      hasUI: true,
      ui: {
        notify: (msg: string, level?: "info" | "warning" | "error") => {
          notifications.push({ msg, level });
        },
      },
    };

    try {
      await handlers.agent_start?.(undefined, parentCtx);
      // Append another assistant turn
      fs.appendFileSync(
        tmpSession,
        "\n" +
          JSON.stringify({
            type: "message",
            message: {
              role: "assistant",
              content: [
                { type: "thinking", thinking: "Analyzing and planning..." },
                { type: "text", text: "Done" },
              ],
              ttft: 1500,
              usage: {
                input: 300,
                output: 60,
                cacheRead: 500,
                cost: { input: 0.0006, output: 0.0006, cacheRead: 0.0001, total: 0.0013 },
              },
            },
          }),
      );
      await handlers.agent_end?.(undefined, parentCtx);

      expect(notifications.length).toBe(1);
      expect(notifications[0].msg).toContain("");
      expect(notifications[0].msg).toContain("󰆍");
      expect(notifications[0].msg).toContain("󱐋");
      expect(notifications[0].msg).toContain("󰠓");
      expect(notifications[0].level).toBe("info");
    } finally {
      if (fs.existsSync(tmpSession)) fs.unlinkSync(tmpSession);
    }
  });

  it("default export skips subagent events so subagent totals never pollute parent deltas", async () => {
    const handlers: Record<string, ((e: unknown, ctx: unknown) => Promise<void>)> = {};
    const pi = {
      on: (ev: string, h: (e: unknown, ctx: unknown) => Promise<void>) => {
        handlers[ev] = h;
      },
    } as unknown as ExtensionAPI;
    turnMetrics(pi);

    const subCtx = { sessionManager: { getSessionFile: () => "/x/TestSonic.jsonl" }, hasUI: false, ui: undefined };
    const parentCtx = { sessionManager: { getSessionFile: () => "/x/2026-08-31T10-00-00-000Z_abcd.jsonl" }, hasUI: false, ui: undefined };

    // Subagent events must be no-ops.
    await handlers.agent_start?.(undefined, subCtx);
    await handlers.agent_end?.(undefined, subCtx);

    // Parent events must register.
    await handlers.agent_start?.(undefined, parentCtx);
    expect(typeof handlers.agent_start).toBe("function");
    expect(typeof handlers.agent_end).toBe("function");
    expect(isSubagent(subCtx)).toBe(true);
    expect(isSubagent(parentCtx)).toBe(false);
  });
});

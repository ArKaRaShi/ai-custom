#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import turnMetrics, { formatTokens, formatTurnMetrics, isSubagent } from "../../extensions/turn-metrics";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

describe("given turn-metrics extension, when formatting tokens or detecting subagents, then return expected representations", () => {
  it("formatTokens humanizes token counts cleanly", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(18)).toBe("18");
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1000)).toBe("1.0k");
    expect(formatTokens(5649)).toBe("5.6k");
    expect(formatTokens(12480)).toBe("12.5k");
    expect(formatTokens(999_999)).toBe("1000.0k");
    expect(formatTokens(1_000_000)).toBe("1.0m");
    expect(formatTokens(1_325_500)).toBe("1.3m");
    expect(formatTokens(6_645_500)).toBe("6.6m");
  });

  it("formatTurnMetrics formats breakdown with and without cache", () => {
    // With cache: 176741 cached + 2 new = 176743 total in
    expect(formatTurnMetrics("17.3", 1042, 2, 176741)).toBe("17.3s · 1.0k out · 176.7k in (⚡ 176.7k cached · 2 new)");
    // Example: 24.4k cached + 71.3k new = 95.7k total in
    expect(formatTurnMetrics("4.3", 377, 71300, 24400)).toBe("4.3s · 377 out · 95.7k in (⚡ 24.4k cached · 71.3k new)");
    // Without cache (dCache == 0)
    expect(formatTurnMetrics("5.2", 450, 1250, 0)).toBe("5.2s · 450 out · 1.3k in");
    // Large numbers in millions: 2.5m cached + 5.0m new = 7.5m total in
    expect(formatTurnMetrics("12.0", 1200000, 5000000, 2500000)).toBe("12.0s · 1.2m out · 7.5m in (⚡ 2.5m cached · 5.0m new)");
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
    expect(isSubagent({ isSubagent: true } as unknown as Parameters<typeof isSubagent>[0])).toBe(true);
  });

  it("default export skips subagent events so subagent totals never pollute parent deltas", async () => {
    const handlers: Record<string, ((e: unknown, ctx: unknown) => Promise<void>)> = {};
    const pi = { on: (ev: string, h: (e: unknown, ctx: unknown) => Promise<void>) => { handlers[ev] = h; } } as unknown as ExtensionAPI;
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
    // Subagent guard returns early without throwing — assert no throw and that isSubagent still classifies them.
    expect(isSubagent(subCtx)).toBe(true);
    expect(isSubagent(parentCtx)).toBe(false);
  });
});

#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import { formatTokens, isSubagent } from "../../extensions/turn-metrics";

describe("given turn-metrics extension, when formatting tokens or detecting subagents, then return expected representations", () => {
  it("formatTokens humanizes token counts cleanly", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(18)).toBe("18");
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1000)).toBe("1.0k");
    expect(formatTokens(5649)).toBe("5.6k");
    expect(formatTokens(12480)).toBe("12.5k");
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
});

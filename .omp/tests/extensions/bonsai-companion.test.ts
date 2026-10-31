#!/usr/bin/env bun
import { describe, it, expect } from "bun:test";
import {
  renderGridToAnsiLines,
  getBonsaiStage,
  renderProgressBar,
  swayBonsai,
  getSessionOutputTokens,
  composeBonsaiWidgetLines,
  BONSAI_STAGE_SEEDLING,
  BONSAI_STAGE_GRAND,
} from "@extensions/bonsai-companion";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

const TRUNK_HEX = "#6e4726";
const TRUNK_LIGHT_HEX = "#8b5a2b";
const POT_HEX = "#b85d3b";
const POT_SHADOW_HEX = "#8a4129";

describe("given the bonsai sprite grids, when their shape is checked, then every stage is 10 rows by 12 columns", () => {
  it("has 10 pixel rows with 12 columns each", () => {
    for (const grid of [BONSAI_STAGE_SEEDLING, BONSAI_STAGE_GRAND]) {
      expect(grid.length).toBe(10);
      for (const row of grid) expect(row.length).toBe(12);
    }
  });
});

describe("given a 10-row sprite, when rendered, then it becomes 5 half-block lines", () => {
  it("packs two pixel rows into each terminal line", () => {
    expect(renderGridToAnsiLines(BONSAI_STAGE_GRAND).length).toBe(5);
  });
});

describe("given zero output tokens, when the stage is read, then it is the seedling tier at 0%", () => {
  it("reports tier 1 with zero progress", () => {
    const stage = getBonsaiStage(0);
    expect(stage.tier).toBe(1);
    expect(stage.name).toBe("Seedling");
    expect(stage.progressPct).toBe(0);
  });
});

describe("given the 25k threshold, when tokens cross it, then the tier advances exactly there", () => {
  it("stays at tier 1 just below and advances at the boundary", () => {
    expect(getBonsaiStage(24_999).tier).toBe(1);
    expect(getBonsaiStage(25_000).tier).toBe(2);
  });
});

describe("given tokens far past the last threshold, when the stage is read, then it caps at grand with max growth", () => {
  it("reports tier 4, 100% progress, and no next tier", () => {
    const stage = getBonsaiStage(10_000_000);
    expect(stage.tier).toBe(4);
    expect(stage.name).toBe("Grand Bonsai");
    expect(stage.progressPct).toBe(100);
    expect(stage.nextTierName).toBe("Max growth");
  });
});

describe("given tokens halfway through a tier, when the stage is read, then progress is 50% toward the next tier", () => {
  it("names the next tier and reports 50%", () => {
    const stage = getBonsaiStage(62_500);
    expect(stage.name).toBe("Young Bonsai");
    expect(stage.nextTierName).toBe("Flowering Bonsai");
    expect(stage.progressPct).toBe(50);
  });
});

describe("given 50% progress with a 10-cell bar, when rendered, then five cells are filled", () => {
  it("draws the filled and empty cells with the percentage", () => {
    expect(renderProgressBar(50, 10)).toBe("[▰▰▰▰▰▱▱▱▱▱] 50%");
  });
});

describe("given any wind frame, when the sprite is swayed, then trunk and pot pixels stay in place", () => {
  it("keeps every non-canopy pixel fixed across all 12 frames", () => {
    const fixed = new Set([TRUNK_HEX, TRUNK_LIGHT_HEX, POT_HEX, POT_SHADOW_HEX]);
    for (let frame = 0; frame < 12; frame++) {
      const swayed = swayBonsai(BONSAI_STAGE_GRAND, frame);
      for (let r = 0; r < BONSAI_STAGE_GRAND.length; r++) {
        for (let c = 0; c < BONSAI_STAGE_GRAND[r].length; c++) {
          const hex = BONSAI_STAGE_GRAND[r][c];
          if (hex !== null && fixed.has(hex)) {
            expect(swayed[r][c]).toBe(hex);
          }
        }
      }
    }
  });
});

describe("given a gust frame, when the sprite is swayed, then the canopy moves relative to still air", () => {
  it("produces a different grid than frame 0", () => {
    const still = swayBonsai(BONSAI_STAGE_GRAND, 0);
    const gust = swayBonsai(BONSAI_STAGE_GRAND, 2);
    expect(JSON.stringify(gust)).not.toBe(JSON.stringify(still));
  });
});

describe("given a sprite, when it is swayed, then the input grid is not mutated", () => {
  it("leaves the original sprite unchanged", () => {
    const snapshot = JSON.stringify(BONSAI_STAGE_GRAND);
    swayBonsai(BONSAI_STAGE_GRAND, 3);
    expect(JSON.stringify(BONSAI_STAGE_GRAND)).toBe(snapshot);
  });
});

describe("given a missing session file, when tokens are read, then both counts are zero", () => {
  it("returns zeros without throwing", async () => {
    const result = await getSessionOutputTokens(path.join(os.tmpdir(), "missing-bonsai.jsonl"));
    expect(result).toEqual({ outputTokens: 0, thinkingTokens: 0 });
  });
});

describe("given assistant usage with output and reasoning, when tokens are read, then the larger value counts per message", () => {
  it("sums max(output, thinking) and sums thinking separately, skipping user and bad lines", async () => {
    const file = path.join(os.tmpdir(), `bonsai-${process.pid}-${Date.now()}.jsonl`);
    const rows: Array<unknown> = [
      { type: "message", message: { role: "assistant", usage: { output: 100, reasoning: 40 } } },
      { type: "message", message: { role: "assistant", usage: { output: 10, reasoning: 300 } } },
      { type: "message", message: { role: "user", usage: { output: 999 } } },
    ];
    fs.writeFileSync(file, [...rows.map((r) => JSON.stringify(r)), "not json"].join("\n"));
    try {
      const result = await getSessionOutputTokens(file);
      expect(result.outputTokens).toBe(100 + 300);
      expect(result.thinkingTokens).toBe(40 + 300);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });
});

describe("given zero tokens and no activity, when the widget is composed, then it has 5 sprite lines plus a seedling HUD", () => {
  it("shows the stage name and output token count", () => {
    const lines = composeBonsaiWidgetLines(0);
    expect(lines.length).toBe(6);
    expect(lines[5]).toContain("Seedling");
    expect(lines[5]).toContain("0 output tokens");
  });
});

describe("given thinking tokens, when the widget is composed, then the HUD shows the thinking breakdown", () => {
  it("adds the thinking count in parentheses", () => {
    const hud = composeBonsaiWidgetLines(1_000, undefined, 0, false, 250)[5];
    expect(hud).toContain("(250 thinking)");
  });
});

describe("given the agent is busy, when the widget is composed, then the HUD shows the watering label", () => {
  it("uses the working label instead of resting", () => {
    const hud = composeBonsaiWidgetLines(0, undefined, 1, true)[5];
    expect(hud).toContain("Watering");
  });
});

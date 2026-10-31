import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import * as fs from "fs";

export interface ThemeLike {
  fg(token: string, text: string): string;
}

export interface ExtensionContext {
  isSubagent?: boolean;
  sessionManager?: {
    getSessionFile(): string;
  };
  ui?: {
    setWidget?(key: string, lines?: string[], options?: { placement?: string }): void;
    theme?: ThemeLike;
  };
  setInterval?(fn: () => void | Promise<void>, ms: number): unknown;
  clearTimer?(timer: unknown): void;
}

// ---------------------------------------------------------------------------
// 24-Bit Truecolor ANSI Engine (half-block: fg = top pixel, bg = bottom pixel)
// ---------------------------------------------------------------------------

export function hexToRgb(hex: string): [number, number, number] {
  const num = parseInt(hex.replace("#", ""), 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function hexToFgAnsi(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m`;
}

export function hexToBgAnsi(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[48;2;${r};${g};${b}m`;
}

export function darkenHex(hex: string, factor = 0.72): string {
  const [r, g, b] = hexToRgb(hex).map((c) => Math.round(c * factor));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function renderGridToAnsiLines(grid: Array<Array<string | null>>): string[] {
  const lines: string[] = [];
  for (let r = 0; r + 1 < grid.length; r += 2) {
    let line = "";
    for (let c = 0; c < grid[r].length; c++) {
      const top = grid[r][c];
      const bottom = grid[r + 1][c];
      if (!top && !bottom) {
        line += " ";
        continue;
      }
      const fg = top ? hexToFgAnsi(top) : "";
      const bg = bottom ? hexToBgAnsi(bottom) : "";
      line += `${fg}${bg}▀\x1b[39m\x1b[49m`;
    }
    lines.push(line);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Palette and Sprites (12 columns x 10 pixel rows, one char per pixel)
// ---------------------------------------------------------------------------

const PIXEL_COLORS: Record<string, string> = {
  p: "#ffb7c5", // blossom
  g: "#78c257", // leaf light
  m: "#5a9e3a", // leaf mid
  G: "#3b6e22", // leaf dark
  b: "#6e4726", // bark dark
  B: "#8b5a2b", // bark light
  x: "#b85d3b", // pot
  X: "#8a4129", // pot shadow
};

function spriteToGrid(rows: readonly string[]): Array<Array<string | null>> {
  return rows.map((row) =>
    row.split("").map((ch) => (ch === "." ? null : PIXEL_COLORS[ch] ?? null)),
  );
}

const SEEDLING_ROWS = [
  "............",
  "............",
  "............",
  "............",
  "......g.....",
  ".....gmg....",
  "......b.....",
  "......b.....",
  "....xxxxx...",
  "....XXXXX...",
];

const YOUNG_ROWS = [
  "............",
  "....gGg.....",
  "...gmGmg....",
  "..gmGGGmg...",
  ".gmGGGGGmg..",
  ".....bB.....",
  ".....bB.....",
  "....bBbB....",
  "....xxxxx...",
  "....XXXXX...",
];

const FLOWERING_ROWS = [
  "..pp....pp..",
  ".pgmGGmgpp..",
  "ppgmGGGmgpp.",
  ".pgGGGGGGgp.",
  "..gGGmGGgp..",
  "......bB....",
  ".....bBb....",
  "....bBbBb...",
  "....xxxxx...",
  "....XXXXX...",
];

const GRAND_ROWS = [
  ".pp..pp..pp.",
  "pgmGmgpgmGmp",
  "gmGGGGGGGGmg",
  "pgGGGmGGGGGp",
  ".gGGGGGGGGg.",
  "..gGmGGGmg..",
  ".....bBb....",
  "....bBbBb...",
  "....xxxxx...",
  "....XXXXX...",
];

export const BONSAI_STAGE_SEEDLING = spriteToGrid(SEEDLING_ROWS);
export const BONSAI_STAGE_YOUNG = spriteToGrid(YOUNG_ROWS);
export const BONSAI_STAGE_FLOWERING = spriteToGrid(FLOWERING_ROWS);
export const BONSAI_STAGE_GRAND = spriteToGrid(GRAND_ROWS);

// ---------------------------------------------------------------------------
// Growth Tiers (thresholds in output tokens)
// ---------------------------------------------------------------------------

export interface BonsaiStageInfo {
  tier: number;
  name: string;
  grid: Array<Array<string | null>>;
  nextTierName: string;
  progressPct: number;
}

const TIERS: ReadonlyArray<{ upTo: number; name: string; grid: Array<Array<string | null>> }> = [
  { upTo: 25_000, name: "Seedling", grid: BONSAI_STAGE_SEEDLING },
  { upTo: 100_000, name: "Young Bonsai", grid: BONSAI_STAGE_YOUNG },
  { upTo: 350_000, name: "Flowering Bonsai", grid: BONSAI_STAGE_FLOWERING },
  { upTo: Infinity, name: "Grand Bonsai", grid: BONSAI_STAGE_GRAND },
];

export function getBonsaiStage(outputTokenCount: number): BonsaiStageInfo {
  const index = TIERS.findIndex((t) => outputTokenCount < t.upTo);
  const tierIndex = index === -1 ? TIERS.length - 1 : index;
  const current = TIERS[tierIndex];
  const previousCap = tierIndex === 0 ? 0 : TIERS[tierIndex - 1].upTo;
  const next = TIERS[tierIndex + 1];

  let progressPct = 100;
  if (next) {
    const span = current.upTo - previousCap;
    progressPct = Math.min(100, Math.max(0, Math.floor(((outputTokenCount - previousCap) / span) * 100)));
  }

  return {
    tier: tierIndex + 1,
    name: current.name,
    grid: current.grid,
    nextTierName: next ? next.name : "Max growth",
    progressPct,
  };
}

export function renderProgressBar(pct: number, length = 10): string {
  const filled = Math.round((pct / 100) * length);
  const bar = "▰".repeat(filled) + "▱".repeat(length - filled);
  return `[${bar}] ${pct}%`;
}

// ---------------------------------------------------------------------------
// Wind Sway: only the canopy moves; trunk and pot stay planted.
// ---------------------------------------------------------------------------

// Horizontal canopy offset per frame: a gust that eases in and out.
const WIND_OFFSETS: readonly number[] = [0, 0, 1, 1, 1, 0, 0, -1, -1, -1, 0, 0];

/**
 * Returns a new grid where canopy pixels are shifted by the wind for `frame`.
 * Trunk and pot pixels never move. The input grid is never mutated.
 */
export function swayBonsai(
  grid: Array<Array<string | null>>,
  frame: number,
): Array<Array<string | null>> {
  const offset = WIND_OFFSETS[frame % WIND_OFFSETS.length];
  const width = grid[0].length;
  const out = grid.map((row) => row.slice());
  if (offset === 0) return out;

  const canopyPixels: Array<[number, number, string]> = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < width; c++) {
      const hex = grid[r][c];
      if (hex && CANOPY_HEXES[hex]) {
        out[r][c] = null;
        canopyPixels.push([r, c, hex]);
      }
    }
  }
  for (const [r, c, hex] of canopyPixels) {
    const nc = c + offset;
    if (nc >= 0 && nc < width) out[r][nc] = hex;
  }
  return out;
}

const CANOPY_HEXES: Record<string, true> = {
  "#ffb7c5": true,
  "#78c257": true,
  "#5a9e3a": true,
  "#3b6e22": true,
};

// ---------------------------------------------------------------------------
// Session Usage: parse assistant output + thinking tokens from the session journal
// ---------------------------------------------------------------------------

export interface SessionTokensResult {
  outputTokens: number;
  thinkingTokens: number;
}

export async function getSessionOutputTokens(sessionFile?: string): Promise<SessionTokensResult> {
  const result: SessionTokensResult = { outputTokens: 0, thinkingTokens: 0 };
  if (!sessionFile || !fs.existsSync(sessionFile)) {
    return result;
  }
  try {
    const content = typeof Bun !== "undefined"
      ? await Bun.file(sessionFile).text()
      : fs.readFileSync(sessionFile, "utf-8");
    for (const raw of content.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      try {
        const rec = JSON.parse(line);
        if (rec.type === "message" && rec.message?.role === "assistant") {
          const usage = rec.message.usage || {};
          const outTokens = Number(usage.output) || 0;
          const thinkTokens = Number(
            usage.reasoningTokens || usage.thinking || usage.thoughtTokens || usage.reasoning,
          ) || 0;
          result.outputTokens += Math.max(outTokens, thinkTokens);
          result.thinkingTokens += thinkTokens;
        }
      } catch {}
    }
  } catch {}
  return result;
}

// ---------------------------------------------------------------------------
// Widget Composition
// ---------------------------------------------------------------------------

const WORKING_PULSE = [
  "Watering… ▰▰▰",
  "Watering… ▱▰▰",
  "Watering… ▱▱▰",
  "Watering… ▰▱▰",
];

export function composeBonsaiWidgetLines(
  tokenCount: number,
  theme?: ThemeLike,
  frame = 0,
  isWorking = false,
  thinkingTokens = 0,
): string[] {
  const info = getBonsaiStage(tokenCount);
  const skylineRows = renderGridToAnsiLines(swayBonsai(info.grid, frame));

  const tokenLabel = thinkingTokens > 0
    ? `💧 ${tokenCount.toLocaleString()} output (${thinkingTokens.toLocaleString()} thinking)`
    : `💧 ${tokenCount.toLocaleString()} output tokens`;
  const progLabel = `${renderProgressBar(info.progressPct, 10)} to ${info.nextTierName}`;
  const activityLabel = isWorking
    ? WORKING_PULSE[frame % WORKING_PULSE.length]
    : "Resting in the sun";

  const paint = (token: string, text: string): string =>
    theme ? theme.fg(token, text) : text;

  const hudLine = [
    paint("success", `🌳 ${info.name}`),
    paint("warning", `[Tier ${info.tier}]`),
    paint("warning", tokenLabel),
    paint("success", progLabel),
    paint(isWorking ? "accent" : "dim", activityLabel),
  ].join("  •  ");

  return [...skylineRows, hudLine];
}

// ---------------------------------------------------------------------------
// Extension Entrypoint
// ---------------------------------------------------------------------------

const WIDGET_KEY = "bonsai_companion";

let sessionOutputTokens = 0;
let sessionThinkingTokens = 0;
let isAgentWorking = false;
let animFrame = 0;
let animTimer: unknown = null;

export default function (pi: ExtensionAPI) {
  async function refreshSessionUsage(ctx: ExtensionContext) {
    if (ctx.sessionManager) {
      const usage = await getSessionOutputTokens(ctx.sessionManager.getSessionFile());
      sessionOutputTokens = usage.outputTokens;
      sessionThinkingTokens = usage.thinkingTokens;
    }
  }

  function updateBonsai(ctx?: ExtensionContext) {
    if (!ctx || ctx.isSubagent || !ctx.ui?.setWidget) return;
    const lines = composeBonsaiWidgetLines(
      sessionOutputTokens,
      ctx.ui.theme,
      animFrame,
      isAgentWorking,
      sessionThinkingTokens,
    );
    ctx.ui.setWidget(WIDGET_KEY, lines, { placement: "belowEditor" });
  }

  pi.on("session_start", async (_event: unknown, ctx: ExtensionContext) => {
    sessionOutputTokens = 0;
    sessionThinkingTokens = 0;
    animFrame = 0;
    await refreshSessionUsage(ctx);
    updateBonsai(ctx);

    if (animTimer !== null && ctx.clearTimer) {
      ctx.clearTimer(animTimer);
      animTimer = null;
    }

    const schedule = ctx.setInterval
      ? ctx.setInterval.bind(ctx)
      : (fn: () => void, ms: number) => setInterval(fn, ms);

    animTimer = schedule(() => {
      animFrame++;
      updateBonsai(ctx);
    }, 500);
  });

  pi.on("turn_end", async (_event: unknown, ctx: ExtensionContext) => {
    isAgentWorking = false;
    await refreshSessionUsage(ctx);
    updateBonsai(ctx);
  });

  pi.on("agent_start", async (_event: unknown, ctx: ExtensionContext) => {
    isAgentWorking = true;
    updateBonsai(ctx);
  });

  pi.on("agent_end", async (_event: unknown, ctx: ExtensionContext) => {
    isAgentWorking = false;
    await refreshSessionUsage(ctx);
    updateBonsai(ctx);
  });

  pi.on("session_resume", async (_event: unknown, ctx: ExtensionContext) => {
    await refreshSessionUsage(ctx);
    updateBonsai(ctx);
  });

  pi.on("session_shutdown", (_event: unknown, ctx: ExtensionContext) => {
    if (animTimer !== null) {
      if (ctx.clearTimer) {
        ctx.clearTimer(animTimer);
      } else {
        clearInterval(animTimer as NodeJS.Timeout);
      }
      animTimer = null;
    }
    if (ctx.ui?.setWidget) {
      ctx.ui.setWidget(WIDGET_KEY, undefined);
    }
  });
}

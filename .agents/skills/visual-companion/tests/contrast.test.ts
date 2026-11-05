import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../assets/components.css", import.meta.url), "utf8");

function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Reads the custom properties of the first block matching `opener`. */
function palette(opener: RegExp): Record<string, string> {
  const block = css.match(new RegExp(`${opener.source}\\s*\\{([^}]*)\\}`));
  if (!block) throw new Error(`no palette block for ${opener}`);
  const tokens: Record<string, string> = {};
  for (const [, name, value] of block[1].matchAll(/--(vc-[a-z-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens[name] = value;
  }
  return tokens;
}

const light = palette(/:root/);
const dark = palette(/:root\[data-vc-theme="dark"\]/);

const TEXT = ["vc-fg", "vc-muted", "vc-ok", "vc-warn", "vc-danger", "vc-accent"];

test("WCAG 1.4.3: every text color reaches 4.5:1 on both surfaces, in both themes", () => {
  for (const [theme, tokens] of [["light", light], ["dark", dark]] as const) {
    for (const name of TEXT) {
      for (const surface of ["vc-bg", "vc-surface"]) {
        const ratio = contrast(tokens[name], tokens[surface]);
        expect({ theme, text: name, on: surface, ratio: Math.round(ratio * 100) / 100 }).toMatchObject({
          ratio: expect.any(Number),
        });
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      }
    }
  }
});

test("WCAG 1.4.3: button label reaches 4.5:1 on the accent fill", () => {
  for (const tokens of [light, dark]) {
    expect(contrast(tokens["vc-accent-fg"], tokens["vc-accent"])).toBeGreaterThanOrEqual(4.5);
  }
});

test("WCAG 1.4.11: the control boundary reaches 3:1, and the decorative hairline is free to stay quiet", () => {
  for (const tokens of [light, dark]) {
    for (const surface of ["vc-bg", "vc-surface"]) {
      expect(contrast(tokens["vc-border-strong"], tokens[surface])).toBeGreaterThanOrEqual(3);
    }
  }
  // The quiet hairline exists, and it is deliberately below the control threshold.
  expect(contrast(light["vc-border"], light["vc-surface"])).toBeLessThan(3);
});

test("WCAG 1.4.11: the focus ring reaches 3:1 against the surface it sits on", () => {
  for (const tokens of [light, dark]) {
    expect(contrast(tokens["vc-accent"], tokens["vc-surface"])).toBeGreaterThanOrEqual(3);
  }
});

test("every control boundary uses the 3:1 token, not the decorative hairline", () => {
  for (const selector of [".vc-btn {", ".vc-input {", ".vc-theme {", ".vc-option {"]) {
    const start = css.indexOf(selector);
    expect(start).toBeGreaterThan(-1);
    const rule = css.slice(start, css.indexOf("}", start));
    expect(rule).toContain("var(--vc-border-strong)");
  }
});

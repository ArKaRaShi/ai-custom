/*
 * The stylesheet half of diagram layout, which the fake DOM cannot see: what keeps a laid-out
 * diagram readable when its window is narrow, and where the lane gap of a top-down diagram comes from.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCss } from "./css";

const path = join(import.meta.dir, "..", "assets", "components.css");
const css = readFileSync(path, "utf8");
const { rules } = parseCss(css);

test("a flow diagram keeps its nodes at their natural width and scrolls inside its own card", () => {
  const scrolls = rules.find((rule) => rule.selector.includes('[data-diagram-kind="flow"]') && /overflow-x:\s*auto\s*;/.test(rule.body));
  expect(scrolls).toBeDefined();
  const natural = rules.find((rule) => rule.selector.includes('[data-diagram-kind="flow"]') && rule.selector.includes(".vc-diagram-stage"));
  expect(natural?.body).toMatch(/min-width:\s*max-content\s*;/);
});

test("tree and state space their lanes by the gap the element asks for, so a label beside a vertical line has room", () => {
  const lanes = rules.find((rule) => rule.selector.includes('[data-diagram-kind="tree"]') && rule.selector.includes('[data-diagram-kind="state"]') && rule.selector.endsWith(".vc-diagram-stage"));
  expect(lanes?.body).toMatch(/column-gap:\s*var\(--vc-lane-gap,\s*var\(--vc-space-6\)\)\s*;/);
});

/** Split a CSS background value into its comma-separated layers, ignoring commas inside parentheses. */
function backgroundLayers(value: string): string[] {
  const layers: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of value) {
    if (character === "(") depth++;
    if (character === ")") depth--;
    if (character === "," && depth === 0) {
      layers.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  layers.push(current.trim());
  return layers;
}

test("a diagram clipped by its card shows a scroll shadow at the clipped edge, in plain CSS and without motion", () => {
  const card = rules.find((rule) => rule.selector.includes('[data-diagram-kind="flow"]') && /overflow-x:\s*auto\s*;/.test(rule.body));
  expect(card).toBeDefined();
  const value = /background:\s*([^;]+);/.exec(card!.body)?.[1];
  expect(value).toBeDefined();
  const layers = backgroundLayers(value!);
  const covers = layers.filter((layer) => /\blocal\b/.test(layer));
  const shadows = layers.filter((layer) => /\bscroll\b/.test(layer));
  // Covers ride with the content and hide the shadows at the ends; with nothing clipped they hide both.
  expect(covers).toHaveLength(2);
  expect(shadows).toHaveLength(2);
  covers.forEach((layer) => expect(layer).toContain("var(--vc-surface)"));
  shadows.forEach((layer) => expect(layer).toMatch(/var\(--vc-(fg|border-strong)\)/));
  expect(layers.at(-1)).toBe("var(--vc-surface)");
  expect(card!.body).not.toMatch(/\b(transition|animation)\b/);
});

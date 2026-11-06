/*
 * A card's padding is the only space between its edge and its content. A child that keeps a
 * margin of its own (a paragraph's default 1em, a stacked component's `margin-top`) adds to that
 * padding, so the content sits further from one edge than from the other cards around it.
 *
 * The expected distance comes from the requirement: first and last content sit 12 to 20px from the
 * card's edge. The distance is derived from the parsed stylesheet: the card's padding plus the
 * margin the first or last child ends up with.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCss, splitSelectors, type CssRule } from "./css";

const path = join(import.meta.dir, "..", "assets", "components.css");
const css = readFileSync(path, "utf8");

const MIN = 12;
const MAX = 20;
/** The browser's default top and bottom margin of a paragraph, the usual first and last child of a card. */
const PARAGRAPH_MARGIN = 16;

interface Card {
  readonly selector: string;
  /** Selector part that, written before the child combinator, addresses the first child. */
  readonly firstChild: string;
  readonly lastChild: string;
  /** A grid row that is empty until it has something to say (a live status line); it must not leave its gap behind. */
  readonly emptyLastRow?: string;
}

const cards: readonly Card[] = [
  { selector: "vc-predict", firstChild: "vc-predict > *", lastChild: "vc-predict > *", emptyLastRow: ".vc-predict-status:empty" },
  { selector: ".vc-card", firstChild: ".vc-card > :first-child", lastChild: ".vc-card > :last-child" },
];

/**
 * The space an empty trailing row adds below the last content: the card's grid gap, unless a rule takes
 * the empty element out of the grid (absolute position) or out of the page.
 */
function emptyRowGap(rules: readonly CssRule[], card: CssRule | undefined, empty: string, space: Map<string, number>): number {
  const outOfFlow = rules.some((rule) => splitSelectors(rule.selector).includes(empty) && /position:\s*absolute|display:\s*none/.test(rule.body));
  if (outOfFlow) return 0;
  const gap = card ? declared(card.body, "gap") : null;
  return gap === null ? 0 : pixels(gap, space);
}

function tokens(rules: readonly CssRule[]): Map<string, number> {
  const found = new Map<string, number>();
  for (const rule of rules) {
    for (const match of rule.body.matchAll(/(--vc-space-\d):\s*(\d+)px/g)) found.set(match[1], Number(match[2]));
  }
  return found;
}

function pixels(value: string, space: Map<string, number>): number {
  const token = /^var\((--[\w-]+)\)$/.exec(value);
  if (token) return space.get(token[1]) ?? Number.NaN;
  const plain = /^(\d+(?:\.\d+)?)(?:px)?$/.exec(value);
  return plain ? Number(plain[1]) : Number.NaN;
}

/** The declared value of `property` in a rule body, or null. */
function declared(body: string, property: string): string | null {
  const match = new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+?)\\s*(?:;|$)`).exec(body);
  return match ? match[1] : null;
}

/** The margin a child gets on one side from the rules that address it, falling back to a paragraph's own. */
function childMargin(rules: readonly CssRule[], selector: string, side: "top" | "bottom", space: Map<string, number>): number {
  let margin = PARAGRAPH_MARGIN;
  for (const rule of rules) {
    if (!splitSelectors(rule.selector).includes(selector)) continue;
    const shorthand = declared(rule.body, "margin");
    const block = declared(rule.body, "margin-block");
    const longhand = declared(rule.body, `margin-${side}`);
    const value = longhand ?? block ?? shorthand;
    if (value === null) continue;
    const first = value.split(/\s+/)[0];
    margin = pixels(first, space);
  }
  return margin;
}

function spacingFaults(source: string): string[] {
  const { rules } = parseCss(source);
  const space = tokens(rules);
  const faults: string[] = [];
  for (const card of cards) {
    const own = rules.find((rule) => rule.selector === card.selector);
    const padding = own ? declared(own.body, "padding") : null;
    const edge = padding === null ? Number.NaN : pixels(padding.split(/\s+/)[0], space);
    const top = edge + childMargin(rules, card.firstChild, "top", space);
    const trailing = card.emptyLastRow ? emptyRowGap(rules, own, card.emptyLastRow, space) : 0;
    const bottom = edge + childMargin(rules, card.lastChild, "bottom", space) + trailing;
    if (!(top >= MIN && top <= MAX)) faults.push(`${card.selector}: first content ${top}px from the top edge`);
    if (!(bottom >= MIN && bottom <= MAX)) faults.push(`${card.selector}: last content ${bottom}px from the bottom edge`);
  }
  faults.push(...hiddenDriverFaults(rules, space));
  return faults;
}

/**
 * A card that opens with an empty `vc-tabs[hide-tabs]` (the invisible driver of a `vc-scrub`) has a
 * visible first content that is the scrub, which keeps a `margin-top` of its own for the case where
 * something sits above it. That margin must not add to the card's padding.
 */
function hiddenDriverFaults(rules: readonly CssRule[], space: Map<string, number>): string[] {
  const card = rules.find((rule) => rule.selector === ".vc-card");
  const padding = card ? declared(card.body, "padding") : null;
  const edge = padding === null ? Number.NaN : pixels(padding.split(/\s+/)[0], space);
  const scrub = rules.find((rule) => rule.selector === "vc-scrub");
  const ownMargin = scrub ? declared(scrub.body, "margin-top") : null;
  let margin = ownMargin === null ? 0 : pixels(ownMargin, space);
  for (const rule of rules) {
    const follows = splitSelectors(rule.selector).some((part) => part.startsWith("vc-tabs[hide-tabs]:first-child") && part.endsWith("+ *"));
    const reset = declared(rule.body, "margin-top");
    if (follows && reset !== null) margin = pixels(reset, space);
  }
  const top = edge + margin;
  return top >= MIN && top <= MAX ? [] : [`.vc-card opening with a hidden vc-tabs: first content ${top}px from the top edge`];
}

test("the first and last content of a card sit 12 to 20px from its edges", () => {
  const faults = spacingFaults(css);
  expect(faults).toEqual([]);
});

test("the check notices a card whose children keep their own margins", () => {
  const broken = css.replace("vc-predict > *", "vc-predict > .x").replace(".vc-card > :first-child", ".vc-card > .y");
  expect(broken).not.toBe(css);
  const faults = spacingFaults(broken);
  expect(faults).toEqual([
    "vc-predict: first content 32px from the top edge",
    "vc-predict: last content 32px from the bottom edge",
    ".vc-card: first content 32px from the top edge",
  ]);
});

test("the check notices a hidden vc-tabs driver whose following scrub keeps its own top margin", () => {
  const broken = css.replace("vc-tabs[hide-tabs]:first-child", "vc-tabs[hide-tabs]:last-child");
  expect(broken).not.toBe(css);
  const faults = spacingFaults(broken);
  expect(faults).toEqual([".vc-card opening with a hidden vc-tabs: first content 28px from the top edge"]);
});

test("the check notices an empty status line that keeps its grid row below the last content", () => {
  const broken = css.replace(".vc-predict-status:empty", ".vc-predict-status:not(:empty)");
  expect(broken).not.toBe(css);
  const faults = spacingFaults(broken);
  expect(faults).toEqual(["vc-predict: last content 28px from the bottom edge"]);
});

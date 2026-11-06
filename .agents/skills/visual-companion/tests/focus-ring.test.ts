/*
 * A focus ring drawn outside a control is cut off when the control sits flush inside an element
 * that clips its overflow: the reader sees two vertical bars instead of a ring. Each control listed
 * here lives flush inside a clipping container, so its ring MUST be drawn inside its own box
 * (a negative outline-offset). Controls that sit inside a container with padding at least as wide
 * as the ring (diagram nodes in a scrolling diagram card) are not listed.
 *
 * The offset a focused control gets is the one the cascade picks: a later cascade layer beats an
 * earlier one whatever the specificity, then the heavier selector, then the later rule. That matters
 * here because the shell's own ring rule lives in a later layer than the components.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCss, splitSelectors, type CssRule } from "./css";

const path = join(import.meta.dir, "..", "assets", "components.css");
const css = readFileSync(path, "utf8");

interface Pairing {
  /** Selector of the rule that clips overflow, as written in the stylesheet. */
  readonly container: string;
  /** The focusable control inside it, as a single simple selector. */
  readonly control: string;
  /** The control carries a `tabindex` attribute (a roving tab stop), which the shell's ring rule matches. */
  readonly tabindex: boolean;
}

const flushControls: readonly Pairing[] = [
  { container: "vc-tabs > .vc-tablist", control: ".vc-tab", tabindex: true },
  { container: ".vc-timebar-bar", control: ".vc-timebar-segment", tabindex: false },
];

function declaredValue(body: string, property: string): string | null {
  const match = new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+?)\\s*(?:;|$)`).exec(body);
  return match ? match[1] : null;
}

/** The shell's rule `:where(.vc-body :where(..., [tabindex]:not([tabindex="-1"], <excluded>...), ...)):focus-visible`. */
function shellRingApplies(part: string, pairing: Pairing): boolean {
  const excluded = /\[tabindex\]:not\(([^)]*\])?,?([^)]*)\)/.exec(part);
  if (!excluded || !part.endsWith(":focus-visible") || !pairing.tabindex) return false;
  const names = splitSelectors(`${excluded[1] ?? ""},${excluded[2] ?? ""}`);
  return !names.includes(pairing.control);
}

/** Whether a selector part sets the focus ring of the control, and with what specificity weight (a :where() list weighs nothing). */
function focusWeight(part: string, pairing: Pairing): number | null {
  if (part === `${pairing.control}:focus-visible`) return 1;
  const open = ":where(";
  const close = "):focus-visible";
  if (!part.startsWith(open) || !part.endsWith(close)) return null;
  const innerSource = part.slice(open.length, part.length - close.length);
  const inner = splitSelectors(innerSource);
  if (inner.includes(pairing.control)) return 0;
  return shellRingApplies(part, pairing) ? 0 : null;
}

function layerOrder(source: string): string[] {
  const declaration = /@layer\s+([\w.\s,]+);/.exec(source);
  return declaration ? declaration[1].split(",").map((name) => name.trim()) : [];
}

/** The outline-offset the cascade gives a focused control. */
function effectiveOffset(rules: readonly CssRule[], pairing: Pairing, layers: readonly string[]): string | null {
  let best: { rank: number; weight: number; value: string } | null = null;
  for (const rule of rules) {
    const value = declaredValue(rule.body, "outline-offset");
    if (value === null) continue;
    const rank = rule.layer === null ? layers.length : layers.indexOf(rule.layer);
    for (const part of splitSelectors(rule.selector)) {
      const weight = focusWeight(part, pairing);
      if (weight === null) continue;
      const wins = best === null || rank > best.rank || (rank === best.rank && weight >= best.weight);
      if (wins) best = { rank, weight, value };
    }
  }
  return best ? best.value : null;
}

function focusRingFaults(source: string): string[] {
  const { rules } = parseCss(source);
  const layers = layerOrder(source);
  const faults: string[] = [];
  for (const pairing of flushControls) {
    const { container, control } = pairing;
    const clippers = rules.filter((rule) => splitSelectors(rule.selector).includes(container));
    const clipper = clippers[0];
    const clips = clipper !== undefined && /overflow(?:-x|-y)?:\s*(?:auto|hidden|scroll|clip)\s*(?:;|$)/.test(clipper.body);
    if (!clips) faults.push(`${container} no longer clips overflow; drop ${control} from the list`);
    const offset = effectiveOffset(rules, pairing, layers);
    const outside = offset === null || !/^-\d/.test(offset);
    if (outside) faults.push(`${control} is flush inside ${container} but its focus ring offset is ${offset ?? "unset"}`);
  }
  return faults;
}

test("a control flush inside a clipping container draws its focus ring inside its own box", () => {
  const faults = focusRingFaults(css);
  expect(faults).toEqual([]);
});

test("the check notices a flush control whose ring is drawn outside its box", () => {
  const broken = css.replace("outline-offset: -2px;", "outline-offset: 2px;");
  expect(broken).not.toBe(css);
  const faults = focusRingFaults(broken);
  expect(faults).toEqual([
    ".vc-tab is flush inside vc-tabs > .vc-tablist but its focus ring offset is 2px",
    ".vc-timebar-segment is flush inside .vc-timebar-bar but its focus ring offset is 2px",
  ]);
});

test("the check notices a shell ring rule in a later layer that overrides the tab's inset ring", () => {
  const broken = css.replace('[tabindex]:not([tabindex="-1"], .vc-tab, .vc-tab-arrow, .vc-timebar-segment)', '[tabindex]:not([tabindex="-1"])');
  expect(broken).not.toBe(css);
  const faults = focusRingFaults(broken);
  expect(faults).toEqual([".vc-tab is flush inside vc-tabs > .vc-tablist but its focus ring offset is 2px"]);
});

/*
 * Catches a stacked card that has no spacing rule around it.
 *
 * The frame provides rhythm for .vc-main and .vc-part, and the layout classes (.vc-stack,
 * .vc-grid, .vc-split, …) provide it everywhere else. A wrapper written by hand provides
 * nothing, so cards placed in one touch with no error — this is that missing error.
 *
 * Static on purpose: no browser is available in the test run, so it checks the markup
 * pattern rather than measured pixels. It only reports two *surfaces* sitting next to each
 * other, which is why card internals (vc-card-head, vc-mockup-head, table rows, stat label
 * and value) never trip it.
 *
 * Which names are surfaces and which containers space their children comes from the
 * catalogue's `spacing` flags, so there is no second list to keep in step.
 */

import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadCatalogue, spacingSets } from "../scripts/catalogue";
import { type MarkupNode, parseMarkup } from "../scripts/markup";
import { parseCss } from "./css";

const { surfaces: SURFACES, surfaceTags: SURFACE_TAGS, providers: PROVIDERS } = spacingSets(loadCatalogue());

/** The parser's root: a fragment's top-level children become .vc-main children, which the frame spaces. */
const ROOT = "#root";

/** Classes a fragment's own <style> block turns into a grid or flex box, or gives a gap. */
function localProviders(source: string): Set<string> {
  const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  const providers = new Set<string>();
  for (const rule of parseCss(styles).rules) {
    if (!/display:\s*(?:grid|flex)|\bgap:/.test(rule.body)) continue;
    const single = /^\.([\w-]+)$/.exec(rule.selector);
    if (single?.[1]) providers.add(single[1]);
  }
  return providers;
}

function isSurface(node: MarkupNode): boolean {
  return SURFACE_TAGS.has(node.tag) || node.classes.some((name) => SURFACES.has(name));
}

function hasOwnSpacing(node: MarkupNode): boolean {
  // Any shorthand margin, or the side that faces the neighbour, counts as deliberate.
  return /\bmargin\b|\bmargin-(top|bottom)\b|margin:/.test(node.style);
}

/** Every wrapper where two surfaces sit flush against each other. */
export function findTouchingSurfaces(source: string): string[] {
  const problems: string[] = [];
  const local = localProviders(source);
  const visit = (parent: MarkupNode) => {
    const containerProvides =
      parent.tag === ROOT ||
      PROVIDERS.has(parent.tag) ||
      parent.classes.some((name) => PROVIDERS.has(name) || local.has(name)) ||
      /display:(grid|flex)/.test(parent.style) ||
      /gap:/.test(parent.style);

    const children = parent.children;
    for (let i = 1; i < children.length; i++) {
      const previous = children[i - 1]!;
      const next = children[i]!;
      if (!isSurface(previous) || !isSurface(next)) continue;
      if (containerProvides) continue;
      if (hasOwnSpacing(previous) || hasOwnSpacing(next)) continue;
      const parentLabel = `<${parent.tag}${parent.classes.length ? ` class="${parent.classes.join(" ")}"` : ""}>`;
      problems.push(
        `line ${next.line}: ${parentLabel} holds ${previous.classes[0] ?? previous.tag} and ${next.classes[0] ?? next.tag} with no gap`,
      );
    }
    children.forEach(visit);
  };
  const root = parseMarkup(source);
  visit(root);
  return problems;
}

const EXAMPLES = join(import.meta.dir, "..", "examples");

test("no example stacks surfaces without a spacing rule", () => {
  const files = readdirSync(EXAMPLES).filter((name) => name.endsWith(".html"));
  expect(files.length).toBeGreaterThan(0);

  const report: string[] = [];
  for (const file of files) {
    const source = readFileSync(join(EXAMPLES, file), "utf8");
    // A whole document brings its own stylesheet; the frame's rules never reach it.
    if (/^\s*<!doctype|^\s*<html/i.test(source)) continue;
    for (const problem of findTouchingSurfaces(source)) report.push(`${file} ${problem}`);
  }
  expect(report).toEqual([]);
});

test("the check sees a real problem, not just a clean corpus", () => {
  const cards = [
    '<div class="vc-card"><p>one</p></div>',
    '<div class="vc-card"><p>two</p></div>',
  ].join("\n");

  // The anti-pattern: a wrapper the author wrote, with no spacing of its own.
  const bareWrapper = `<div class="panel">\n${cards}\n</div>`;
  expect(findTouchingSurfaces(bareWrapper)).toHaveLength(1);

  expect(findTouchingSurfaces(`<div class="vc-stack">\n${cards}\n</div>`)).toEqual([]);
  expect(findTouchingSurfaces(`<div style="display:grid;gap:12px">\n${cards}\n</div>`)).toEqual([]);
  expect(findTouchingSurfaces(`<div class="panel">\n<div class="vc-card" style="margin-bottom:8px"><p>one</p></div>\n<div class="vc-card"><p>two</p></div>\n</div>`)).toEqual([]);

  // The page root is spaced by the frame, so top-level cards are fine there.
  expect(findTouchingSurfaces(cards)).toEqual([]);

  // A label above its own value is one unit, not a stack.
  const stat = '<div class="vc-stat"><div class="vc-label">Users</div><div class="vc-stat-value">1</div></div>';
  expect(findTouchingSurfaces(stat)).toEqual([]);
});

test("a wrapper the fragment's own style block turns into a grid counts as spacing", () => {
  const styled = `<style>.panel { display: grid; gap: 8px; }</style>\n<div class="panel">\n<div class="vc-card">a</div>\n<div class="vc-card">b</div>\n</div>`;
  expect(findTouchingSurfaces(styled)).toEqual([]);
  expect(findTouchingSurfaces(styled.replace("display: grid; gap: 8px;", "color: red;"))).toHaveLength(1);
});

test("the surface and container sets come from the catalogue, and elements are tags", () => {
  expect(SURFACES.has("vc-card")).toBe(true);
  expect(SURFACES.has("vc-stack")).toBe(false);
  expect(PROVIDERS.has("vc-stack")).toBe(true);
  expect(PROVIDERS.has("vc-main")).toBe(true);
  expect(SURFACE_TAGS.has("vc-tabs")).toBe(true);
  expect(SURFACE_TAGS.has("vc-card")).toBe(false);
});

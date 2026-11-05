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
 */

import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Blocks that render their own border or fill, so touching each other reads as one box. */
const SURFACES = new Set([
  "vc-card", "vc-answer", "vc-stat", "vc-table", "vc-proscons", "vc-mockup",
  "vc-collapsed", "vc-placeholder", "vc-scroll", "vc-options", "vc-grid",
  "vc-split", "vc-steps", "vc-code", "vc-tabs", "vc-chart", "vc-scrub",
  "vc-inspect",
]);

/** Surface elements carry their own internal layout, so only authored wrappers are suspect. */
const SURFACE_TAGS = new Set([
  "vc-code", "vc-tabs", "vc-chart", "vc-scrub", "vc-inspect",
]);

/** Containers that already space their children. The root is here because a fragment's
 *  top-level children become .vc-main children, which the frame spaces. */
const PROVIDERS = new Set([
  "#root",
  "vc-main", "vc-part", "vc-page-body", "vc-stack", "vc-row", "vc-grid",
  "vc-split", "vc-options", "vc-proscons", "vc-steps", "vc-toc", "vc-bar",
  "vc-tabs", "vc-chart", "alt-screen-body",
]);

interface Node {
  tag: string;
  classes: string[];
  style: string;
  line: number;
  children: Node[];
}

const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "source", "path", "circle"]);

function parse(source: string): Node {
  const cleaned = source
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ""))
    .replace(/<style[\s\S]*?<\/style>/gi, (m) => m.replace(/[^\n]/g, ""))
    .replace(/<script[\s\S]*?<\/script>/gi, (m) => m.replace(/[^\n]/g, ""));

  const root: Node = { tag: "#root", classes: [], style: "", line: 0, children: [] };
  const stack: Node[] = [root];
  const tagPattern = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(cleaned)) !== null) {
    const [, closing, rawTag, rawAttrs, selfClosing] = match;
    const tag = rawTag.toLowerCase();
    if (closing) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const classMatch = rawAttrs.match(/class\s*=\s*"([^"]*)"|class\s*=\s*'([^']*)'/);
    const styleMatch = rawAttrs.match(/style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'/);
    const node: Node = {
      tag,
      classes: (classMatch?.[1] ?? classMatch?.[2] ?? "").split(/\s+/).filter(Boolean),
      style: (styleMatch?.[1] ?? styleMatch?.[2] ?? "").replace(/\s+/g, ""),
      line: cleaned.slice(0, match.index).split("\n").length,
      children: [],
    };
    stack[stack.length - 1].children.push(node);
    if (!VOID.has(tag) && !selfClosing) stack.push(node);
  }
  return root;
}

function isSurface(node: Node): boolean {
  return SURFACE_TAGS.has(node.tag) || node.classes.some((name) => SURFACES.has(name));
}

function hasOwnSpacing(node: Node): boolean {
  // Any shorthand margin, or the side that faces the neighbour, counts as deliberate.
  return /\bmargin\b|\bmargin-(top|bottom)\b|margin:/.test(node.style);
}

/** Every wrapper where two surfaces sit flush against each other. */
export function findTouchingSurfaces(source: string): string[] {
  const problems: string[] = [];
  const visit = (parent: Node) => {
    const containerProvides =
      PROVIDERS.has(parent.tag) ||
      parent.classes.some((name) => PROVIDERS.has(name)) ||
      /display:(grid|flex)/.test(parent.style) ||
      /gap:/.test(parent.style);

    const children = parent.children;
    for (let i = 1; i < children.length; i++) {
      const previous = children[i - 1];
      const next = children[i];
      if (!isSurface(previous) || !isSurface(next)) continue;
      if (containerProvides) continue;
      if (hasOwnSpacing(previous) || hasOwnSpacing(next)) continue;
      const parentLabel = parent.tag === "#root" ? "the page root" : `<${parent.tag}${parent.classes.length ? ` class="${parent.classes.join(" ")}"` : ""}>`;
      problems.push(
        `line ${next.line}: ${parentLabel} holds ${previous.classes[0] ?? previous.tag} and ${next.classes[0] ?? next.tag} with no gap`,
      );
    }
    children.forEach(visit);
  };
  visit(parse(source));
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

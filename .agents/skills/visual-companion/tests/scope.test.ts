/*
 * What makes it safe for a plain document to opt in to the component layer: nothing in
 * components.css can reach an element the component layer does not own. These tests read the
 * stylesheet, not a browser, so they guard the structure the safety depends on.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { loadCatalogue } from "../scripts/catalogue";
import { parseCss, splitSelectors, stripComments } from "./css";

const source = readFileSync(new URL("../assets/components.css", import.meta.url), "utf8");
const { rules, nested } = parseCss(source);
const catalogue = loadCatalogue();

const OWN = /^(?:\.vc-|vc-[a-z]|:root\b|\[class(?:\^=|\*=)"\s?vc-)/;

/** A selector is ours when it starts with a vc class, a vc tag, :root, or a :where() of those. */
function scoped(selector: string): boolean {
  if (OWN.test(selector)) return true;
  if (!selector.startsWith(":where(")) return false;
  let depth = 0;
  let close = -1;
  for (let i = 6; i < selector.length; i++) {
    if (selector[i] === "(") depth++;
    if (selector[i] === ")" && --depth === 0) {
      close = i;
      break;
    }
  }
  if (close < 0) return false;
  return splitSelectors(selector.slice(7, close)).every(scoped);
}

test("every selector starts with a vc class, a vc tag, :root, or a :where() of those", () => {
  const bare = rules.flatMap((rule) => splitSelectors(rule.selector)).filter((selector) => !scoped(selector));
  expect(bare).toEqual([]);
});

test("the scope check sees a real problem, not just a clean file", () => {
  for (const selector of ["*", "html", "body", "a", "button.vc-btn", ":where(a, .vc-card)", ".page .vc-card"]) {
    expect(scoped(selector)).toBe(false);
  }
  for (const selector of [".vc-card", "vc-tabs .vc-tab", ":root", ':where([class^="vc-"], vc-tabs)::before', ":where(.vc-body :where(a)):focus-visible"]) {
    expect(scoped(selector)).toBe(true);
  }
});

test("every rule sits inside one of the four declared layers", () => {
  const first = stripComments(source).trim().split("\n")[0];
  expect(first).toBe("@layer vc.tokens, vc.base, vc.components, vc.frame;");
  const outside = rules.filter((rule) => rule.layer === null).map((rule) => rule.selector);
  expect(outside).toEqual([]);
  expect([...new Set(rules.map((rule) => rule.layer))].sort()).toEqual(["vc.base", "vc.components", "vc.frame", "vc.tokens"]);
});

test("the shell's classes are styled in the frame layer and nowhere else", () => {
  const frame = new Set(catalogue.internal.filter((group) => group.scope === "frame").flatMap((group) => group.names));
  expect(frame.size).toBeGreaterThan(0);
  const leaked: string[] = [];
  for (const rule of rules) {
    if (rule.layer === "vc.frame") continue;
    for (const [, name] of rule.selector.matchAll(/\.(vc-[a-z0-9-]+)/g)) {
      if (name && frame.has(name)) leaked.push(`${rule.layer}: ${rule.selector}`);
    }
  }
  expect(leaked).toEqual([]);
});

test("components.css has no CSS nesting, because the tests read a rule up to its first closing brace", () => {
  expect(nested).toEqual([]);
});

test("palette tokens are declared only as literal hex, and only in the root blocks", () => {
  const palette = /--vc-(?:bg|surface|fg|muted|border|border-strong|accent|accent-fg|ok|warn|danger)\s*:\s*([^;}]+)/g;
  const problems: string[] = [];
  for (const rule of rules) {
    for (const [, value] of rule.body.matchAll(palette)) {
      if (!rule.selector.startsWith(":root")) problems.push(`${rule.selector} declares a palette token`);
      else if (!/^#[0-9a-fA-F]{3,8}$/.test((value ?? "").trim())) problems.push(`${rule.selector}: ${value} is not literal hex`);
    }
  }
  expect(problems).toEqual([]);
});

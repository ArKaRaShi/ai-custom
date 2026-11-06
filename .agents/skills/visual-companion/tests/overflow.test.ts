/*
 * Author markup that carries no class of ours must not push the page wider than the screen.
 * A bare code block with a long line, and a table that has no scroll wrapper around it, both did:
 * at 390px wide a page grew to 1025px and 450px. The fix is a pair of rules in the stylesheet, so
 * the guard reads the parsed stylesheet for them.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCss, splitSelectors } from "./css";

const css = readFileSync(join(import.meta.dir, "..", "assets", "components.css"), "utf8");
const { rules } = parseCss(css);

/** True when a rule addressing `selector` scrolls its own overflow instead of letting it run past the box. */
function scrollsInside(selector: string, layer: string): boolean {
  return rules.some(
    (rule) =>
      rule.layer === layer &&
      splitSelectors(rule.selector).includes(selector) &&
      /overflow-x:\s*(auto|scroll)/.test(rule.body),
  );
}

test("given a code block with no class under the shell, then its long lines scroll inside it", () => {
  expect(scrollsInside(".vc-body pre", "vc.frame")).toBe(true);
});

test("given the classed code block, then it still scrolls inside its own box", () => {
  expect(scrollsInside(".vc-pre", "vc.components")).toBe(true);
});

test("given a table with no scroll wrapper, then a narrow screen scrolls it inside its own box", () => {
  expect(scrollsInside(".vc-table", "vc.components")).toBe(true);
});

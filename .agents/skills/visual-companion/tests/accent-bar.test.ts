import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { stripComments } from "./css";

/**
 * A thick border on one side next to a border-radius makes the browser blend it into the
 * neighbouring borders, so the bar tapers to a crescent at both corners. An accent bar is a
 * background layer instead, which the rounded corners clip straight.
 */
export function findTaperedBars(css: string): string[] {
  const found: string[] = [];
  const plain = stripComments(css);
  for (const [, selector, body] of plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const thick = /border-(?:left|right|top|bottom)(?:-width)?\s*:\s*(?:[2-9]|\d{2,})px/.test(body);
    const rounded = /border-radius\s*:\s*(?!0\s*[;}]|0\s*$)/.test(body);
    if (thick && rounded) found.push(selector.trim().replace(/\s+/g, " "));
  }
  return found;
}

test("no rule draws a thick one-sided border beside a border-radius", () => {
  const url = new URL("../assets/components.css", import.meta.url);
  const css = readFileSync(url, "utf8");
  const problems = findTaperedBars(css);

  expect(problems).toEqual([]);
});

test("the guard notices a thick left border beside a radius", () => {
  const broken = ".vc-x { border-left: 4px solid red; border-radius: 14px; }";
  const fine = ".vc-x { border: 1px solid red; border-radius: 14px; }";
  const brokenProblems = findTaperedBars(broken);
  const fineProblems = findTaperedBars(fine);

  expect(brokenProblems).toEqual([".vc-x"]);
  expect(fineProblems).toEqual([]);
});

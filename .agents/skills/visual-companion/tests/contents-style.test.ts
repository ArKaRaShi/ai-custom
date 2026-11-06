import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCss } from "./css";

test("in-page contents hide list markers when links contain number spans", () => {
  const path = join(import.meta.dir, "..", "assets", "components.css");
  const css = readFileSync(path, "utf8");
  const parsed = parseCss(css);
  const rules = parsed.rules;
  const list = rules.find((rule) => rule.selector === 'vc-contents:not([variant="rail"]) ol:has(> li > a > .vc-contents-num)');
  expect(list?.body).toMatch(/list-style:\s*none\s*;/);
  const link = rules.find((rule) => rule.selector === 'vc-contents:not([variant="rail"]) a');
  expect(link?.body).toMatch(/gap:\s*var\(--vc-space-2\)/);
});

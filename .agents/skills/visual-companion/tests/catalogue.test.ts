import "./globals";
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ELEMENTS } from "../assets/components/index.js";
import {
  authoringNames,
  elementEntries,
  knownNames,
  loadCatalogue,
  NEEDS_READY_RULE,
  validateCatalogue,
} from "../scripts/catalogue";
import { lintMarkup } from "../scripts/markup";
import { escapeHtml, renderGallery } from "../scripts/render";
import { parseCss } from "./css";

const catalogue = loadCatalogue();
const css = readFileSync(new URL("../assets/components.css", import.meta.url), "utf8");
const selectors = parseCss(css).rules.map((rule) => rule.selector);
const selectorText = selectors.join("\n");

const hasClassRule = (name: string): boolean => new RegExp(`\\.${name}(?![\\w-])`).test(selectorText);
const hasTagRule = (name: string): boolean => new RegExp(`(?<![\\w.#-])${name}(?![\\w-])`).test(selectorText);

function readRaw(): { entries: { snippet: string }[] } {
  return JSON.parse(readFileSync(new URL("../assets/catalogue.json", import.meta.url), "utf8"));
}

test("validateCatalogue accepts the real catalogue", () => {
  expect(validateCatalogue(readRaw())).toMatchObject({ ok: true });
});

test("validateCatalogue reports every problem in a broken catalogue, not just the first", () => {
  const result = validateCatalogue({
    version: 1,
    modes: [],
    groups: [{ id: "a", title: "A" }, { id: "empty", title: "Empty" }],
    entries: [
      { kind: "class", names: ["vc-x"], group: "a", what: "x", snippet: "<p>…</p>", spacing: { surface: false, spaces: false } },
      { kind: "class", names: ["vc-x"], group: "nope", what: "dup", snippet: "<p></p>", spacing: { surface: true } },
      { kind: "element", names: ["vc-y"], group: "a", what: "y", snippet: "<vc-y></vc-y>", spacing: { surface: false, spaces: false }, attrs: {}, degrade: [] },
    ],
    internal: [],
    recorded: "r",
  });
  expect(result.ok).toBe(false);
  if (result.ok) return;
  const text = result.problems.join("\n");
  expect(text).toContain("version");
  expect(text).toContain("must be runnable markup");
  expect(text).toContain('unknown group "nope"');
  expect(text).toContain("needs boolean surface and spaces");
  expect(text).toContain("needs at least one entry");
  expect(text).toContain("vc-x: declared twice");
  expect(text).toContain("group empty: has no entries");
});

test("snippet ids are unique across the catalogue, because the gallery shows them all on one page", () => {
  const raw = readRaw();
  const [first, second] = raw.entries.filter((entry) => entry.snippet.includes(' id="'));
  second!.snippet = first!.snippet;
  const result = validateCatalogue(raw);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.problems.join("\n")).toContain("is also used by");
});

test("every class an entry advertises has a rule in components.css", () => {
  const missing: string[] = [];
  for (const entry of catalogue.entries) {
    for (const name of [...entry.names, ...entry.parts]) {
      const ok = entry.kind === "class" ? hasClassRule(name) : hasClassRule(name) || hasTagRule(name);
      if (!ok) missing.push(name);
    }
  }
  expect(missing).toEqual([]);
});

test("every internal name still has a rule, so the list cannot rot", () => {
  const missing = catalogue.internal.flatMap((group) => group.names).filter((name) => !hasClassRule(name));
  expect(missing).toEqual([]);
});

test("every .vc-* class in components.css is a name, a part, or listed as internal", () => {
  const known = knownNames(catalogue);
  const nobodyCatalogued = new Set<string>();
  for (const [, name] of selectorText.matchAll(/\.(vc-[a-z0-9-]+)/g)) {
    if (name && !known.has(name)) nobodyCatalogued.add(name);
  }
  expect([...nobodyCatalogued]).toEqual([]);
});

test("every vc-* tag the CSS styles is an element entry or a part of one", () => {
  const tags = authoringNames(catalogue);
  const unknown = new Set<string>();
  for (const [, name] of selectorText.matchAll(/(?<![\w.#-])(vc-[a-z0-9-]+)/g)) {
    if (name && !tags.has(name)) unknown.add(name);
  }
  expect([...unknown]).toEqual([]);
});

test("Object.keys(ELEMENTS) equals the catalogue's element entries, in both directions", () => {
  const entries = elementEntries(catalogue).flatMap((entry) => entry.names);
  expect(Object.keys(ELEMENTS).sort()).toEqual([...entries].sort());
});

test("a degrade kind that needs a no-script form has a :not([data-ready]) rule naming the tag", () => {
  const missing: string[] = [];
  for (const entry of elementEntries(catalogue)) {
    const tag = entry.names[0] ?? "";
    for (const degrade of entry.degrade) {
      if (!NEEDS_READY_RULE.has(degrade.shows)) continue;
      const covered = selectors.some(
        (selector) => selector.includes(tag) && selector.includes(":not([data-ready])") && (degrade.when === null || selector.includes(degrade.when)),
      );
      if (!covered) missing.push(`${tag} ${degrade.when ?? ""} (${degrade.shows})`);
    }
  }
  expect(missing).toEqual([]);
});

test("first-panel degrade is covered by the :has(> [data-active]) fallback rule", () => {
  for (const entry of elementEntries(catalogue)) {
    for (const degrade of entry.degrade) {
      if (degrade.shows !== "first-panel") continue;
      expect(selectors.some((selector) => selector.includes(entry.names[0] ?? "") && selector.includes(":not(:has(> "))).toBe(true);
    }
  }
});

test("no snippet carries a placeholder, and every snippet lints clean", () => {
  const report: string[] = [];
  for (const entry of catalogue.entries) {
    expect(entry.snippet).not.toContain("…");
    for (const finding of lintMarkup(entry.snippet, catalogue)) report.push(`${entry.names[0]}: ${finding.rule}: ${finding.message}`);
  }
  expect(report).toEqual([]);
});

test("the generated gallery shows every class and element the catalogue advertises", () => {
  const generated = renderGallery(catalogue);
  const missing = catalogue.entries.flatMap((entry) => entry.names).filter((name) => !generated.includes(name));
  expect(missing).toEqual([]);
});

test("the gallery has one part per group, in catalogue order", () => {
  const titles = [...renderGallery(catalogue).matchAll(/<h2 class="vc-part-title"[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
  expect(titles).toEqual(catalogue.groups.map((group) => escapeHtml(group.title)));
});

test("the committed examples/component-gallery.html is the generated one; regenerate it with `cli.ts gallery`", () => {
  const committed = readFileSync(new URL("../examples/component-gallery.html", import.meta.url), "utf8");
  expect(committed).toBe(`${renderGallery(catalogue)}\n`);
});

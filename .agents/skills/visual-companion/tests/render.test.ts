import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { loadCatalogue } from "../scripts/catalogue";
import { composePage, emptyState, escapeHtml, renderGallery, renderScreen, withClient } from "../scripts/render";
import { parseCss } from "./css";

const CLIENT = '<script src="/assets/client.js" defer></script>';
const MODULE = '<script type="module" src="/assets/components/index.js"></script>';
const STYLE = '<link rel="stylesheet" href="/assets/components.css">';

const css = parseCss(readFileSync(new URL("../assets/components.css", import.meta.url), "utf8"));
const frameHtml = readFileSync(new URL("../assets/frame.html", import.meta.url), "utf8");

/** The palette's own --vc-bg, read back from the stylesheet so the theme-color cannot drift from it. */
function paletteBg(selector: string): string {
  const rule = css.rules.find((r) => r.layer === "vc.tokens" && r.selector === selector);
  const bg = /--vc-bg:\s*(#[0-9a-fA-F]{6})\s*;/.exec(rule?.body ?? "");
  if (!bg?.[1]) throw new Error(`no --vc-bg in ${selector}`);
  return bg[1].toLowerCase();
}

const LIGHT_BG = paletteBg(":root");
const DARK_BG = paletteBg(':root[data-vc-theme="dark"]');
const LIGHT_SCHEME = `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${LIGHT_BG}">`;
const DARK_SCHEME = `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${DARK_BG}">`;
/** What a page that follows the OS gets: one tag per scheme. */
const FOLLOWS_OS = `${LIGHT_SCHEME}${DARK_SCHEME}`;
const PINNED_LIGHT = `<meta name="theme-color" content="${LIGHT_BG}">`;
const PINNED_DARK = `<meta name="theme-color" content="${DARK_BG}">`;

const plain = "<!doctype html><html lang=en><head><title>t</title></head><body><p>mine</p></body></html>";

test("a plain document without the opt-in is the document plus client.js, byte for byte", () => {
  expect(withClient(plain, { scripts: true })).toBe(plain.replace("</body>", `${CLIENT}\n</body>`));
  const bodyless = "<p>no body tag</p>";
  expect(withClient(bodyless, { scripts: true })).toBe(`${bodyless}\n${CLIENT}`);
});

test("an isolated plain document without the opt-in is returned untouched", async () => {
  expect(withClient(plain, { scripts: false })).toBe(plain);
  expect(await renderScreen({ mode: "plain", title: "t", content: plain, isolated: true })).toBe(plain);
});

test("a document that already loads client.js is left alone, opt-in or not", () => {
  const own = `<html data-vc-components><body>${CLIENT}</body></html>`;
  expect(withClient(own, { scripts: true })).toBe(own);
});

test("the opt-in adds the stylesheet and theme-color after <html>, the module ahead of client.js, and pins the light palette", () => {
  const doc = '<!doctype html><html lang="en" data-vc-components><head></head><body>x</body></html>';
  const out = withClient(doc, { scripts: true });
  expect(out).toBe(
    `<!doctype html><html data-vc-theme="light" lang="en" data-vc-components>${STYLE}${PINNED_LIGHT}<head></head><body>x${MODULE}\n${CLIENT}\n</body></html>`,
  );
});

test("the opt-in value picks the palette: light, dark, or none for auto", () => {
  const themed = (value: string): string => withClient(`<html data-vc-components${value}><body></body></html>`, { scripts: true });
  expect(themed("")).toContain('data-vc-theme="light"');
  expect(themed('="light"')).toContain('data-vc-theme="light"');
  expect(themed('="dark"')).toContain('data-vc-theme="dark"');
  expect(themed("=DARK")).toContain('data-vc-theme="dark"');
  expect(themed('="auto"')).not.toContain("data-vc-theme");
  expect(themed('="sepia"')).toContain('data-vc-theme="light"');
});

test("a theme the document already pins is not overridden", () => {
  const out = withClient('<html data-vc-theme="dark" data-vc-components><body></body></html>', { scripts: true });
  expect(out.match(/data-vc-theme/g)).toHaveLength(1);
  expect(out).toContain('data-vc-theme="dark"');
});

test("isolated previews get the stylesheet, the pin and the theme-color but never a script", () => {
  const out = withClient('<html data-vc-components="dark"><head></head><body>x</body></html>', { scripts: false });
  expect(out).toBe(`<html data-vc-theme="dark" data-vc-components="dark">${STYLE}${PINNED_DARK}<head></head><body>x</body></html>`);
  expect(out).not.toContain("<script");
});

test("the attribute in a comment, a script, body text or another tag does not trigger the opt-in", () => {
  const decoys = [
    "<!-- <html data-vc-components> --><html><body>x</body></html>",
    "<html><body><script>const s = '<html data-vc-components>'</script></body></html>",
    "<html><body><p>data-vc-components</p></body></html>",
    "<html><body><div data-vc-components>x</div></body></html>",
    '<html data-note="data-vc-components"><body>x</body></html>',
  ];
  for (const doc of decoys) {
    expect(withClient(doc, { scripts: true })).toBe(doc.replace("</body>", `${CLIENT}\n</body>`));
  }
});

test("vc-* markup alone never opts a document in", () => {
  const doc = '<html><body><div class="vc-card"><vc-tabs></vc-tabs></div></body></html>';
  expect(withClient(doc, { scripts: true })).toBe(doc.replace("</body>", `${CLIENT}\n</body>`));
});

test("the theme-color follows the palette the opt-in resolves to: pinned is one unconditional tag, auto is one per scheme", () => {
  const cases: [string, string][] = [
    ["data-vc-components", PINNED_LIGHT],
    ['data-vc-components="light"', PINNED_LIGHT],
    ['data-vc-components="dark"', PINNED_DARK],
    ['data-vc-components="DARK"', PINNED_DARK],
    ['data-vc-components="sepia"', PINNED_LIGHT],
    ['data-vc-components="auto"', FOLLOWS_OS],
    ['data-vc-components="auto" data-vc-theme="dark"', PINNED_DARK],
    ['data-vc-components="dark" data-vc-theme="light"', PINNED_LIGHT],
    ['data-vc-components data-vc-theme="system"', FOLLOWS_OS],
  ];
  for (const [attrs, tags] of cases) {
    for (const scripts of [true, false]) {
      const out = withClient(`<html ${attrs}><body></body></html>`, { scripts });
      const injected = out.match(/name="theme-color"/g);
      expect(out, attrs).toContain(`${STYLE}${tags}<body>`);
      expect(injected, attrs).toHaveLength(tags === FOLLOWS_OS ? 2 : 1);
    }
  }
});

test("a theme-color element the document already has is kept and nothing is added", () => {
  const own = [
    '<meta name="theme-color" content="#123456">',
    '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000">',
    "<meta content=#123456 name=theme-color>",
    '<META NAME="Theme-Color" CONTENT="#123456" />',
  ];
  for (const meta of own) {
    const out = withClient(`<html data-vc-components="auto"><head>${meta}</head><body>x</body></html>`, { scripts: false });
    expect(out, meta).toBe(`<html data-vc-components="auto">${STYLE}<head>${meta}</head><body>x</body></html>`);
  }
});

test("a theme-color in a comment, a script, a style, another tag's attribute or another meta does not count", () => {
  const decoys = [
    '<!-- <meta name="theme-color" content="#123456"> -->',
    `<script>const m = '<meta name="theme-color" content="#123456">'</script>`,
    '<style>/* <meta name="theme-color" content="#123456"> */</style>',
    `<div data-x='<meta name="theme-color" content="#123456">'></div>`,
    '<meta name="theme-colors" content="#123456">',
    '<meta name="color-scheme" content="light dark">',
    '<meta property="theme-color" content="#123456">',
    "<p>theme-color</p>",
  ];
  for (const decoy of decoys) {
    const out = withClient(`<html data-vc-components="auto"><head></head><body>${decoy}</body></html>`, { scripts: false });
    expect(out, decoy).toBe(`<html data-vc-components="auto">${STYLE}${FOLLOWS_OS}<head></head><body>${decoy}</body></html>`);
  }
});

test("the frame paints the browser chrome with each palette's --vc-bg, keyed to prefers-color-scheme", async () => {
  const chrome = (html: string): string[][] =>
    [...html.matchAll(/<meta\s+name="theme-color"\s+media="([^"]*)"\s+content="([^"]*)"\s*\/?>/g)].map((m) => [m[1] ?? "", m[2] ?? ""]);
  const expected = [
    ["(prefers-color-scheme: light)", LIGHT_BG],
    ["(prefers-color-scheme: dark)", DARK_BG],
  ];
  const named = frameHtml.match(/name="theme-color"/g);
  const inFrame = chrome(frameHtml);
  expect(named).toHaveLength(2);
  expect(inFrame).toEqual(expected);

  const screen = await renderScreen({ mode: "bundle", title: "t", content: "<p>x</p>" });
  const empty = await emptyState();
  for (const page of [screen, empty]) {
    const rendered = chrome(page);
    const metaAt = page.indexOf('name="theme-color"');
    const headEnd = page.indexOf("</head>");
    expect(rendered).toEqual(expected);
    expect(metaAt).toBeGreaterThan(-1);
    expect(metaAt).toBeLessThan(headEnd);
  }
});

test("composePage emits a contents rail and one section per part", () => {
  const html = composePage([{ name: "Answer", html: "<p>a</p>" }, { name: "Why <it>", html: "<p>b</p>" }]);
  expect(html).toContain('<vc-contents variant="rail"></vc-contents>');
  expect(html).toContain('id="vc-part-2"');
  expect(html).toContain('id="vc-part-2-title">Why &lt;it&gt;</h2>');
  expect(html.match(/<section class="vc-part"/g)).toHaveLength(2);
});

test("the gallery shows each entry's live snippet and its escaped source", () => {
  const catalogue = loadCatalogue();
  const html = renderGallery(catalogue);
  for (const entry of catalogue.entries) {
    expect(html).toContain(entry.snippet);
    expect(html).toContain(escapeHtml(entry.snippet));
  }
});

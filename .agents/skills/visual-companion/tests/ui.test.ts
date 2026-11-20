import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { range, waffle } from "../scripts/figures.ts";
import { checkPage, loadManifest } from "../scripts/ui.ts";

const css = (name: string): string => readFileSync(new URL(`../assets/ui/${name}`, import.meta.url), "utf8");
const components = css("components.css");
const layout = css("presentation.css");
const withCss = '<link rel="stylesheet" href="/assets/ui/components.css">';

test("the manifest and components.css name the same classes and modifiers", async () => {
  const manifest = await loadManifest();
  const documented = new Set(Object.values(manifest.components).flatMap((e) => [e.class, ...(e.also ?? [])]));
  const styled = new Set([...components.matchAll(/\.(ui-[\w-]+)/g)].map((m) => m[1]));
  expect([...styled].filter((c) => !documented.has(c))).toEqual([]);
  expect([...documented].filter((c) => !styled.has(c))).toEqual([]);

  const byClass = new Map(Object.values(manifest.components).map((e) => [e.class, [...(e.modifiers ?? []), ...(e.states ?? [])]]));
  for (const [, cls, mod] of components.matchAll(/\.(ui-[\w-]+)\.([\w-]+)/g)) expect(byClass.get(cls!), `${cls}.${mod}`).toContain(mod!);
  for (const e of Object.values(manifest.components)) for (const mod of e.modifiers ?? []) expect(components, `.${mod} of ${e.class}`).toMatch(new RegExp(`\\.${mod}\\b`));
});

test("every documented slide layout class is styled by presentation.css", async () => {
  for (const e of Object.values((await loadManifest()).layout)) expect(layout, e.class).toMatch(new RegExp(`\\.${e.class}\\b`));
});

test("every snippet in the manifest passes check", async () => {
  const manifest = await loadManifest();
  for (const e of [...Object.values(manifest.components), ...Object.values(manifest.layout)]) {
    const page = `<html><body class="ui-root">${withCss}${e.snippet}</body></html>`;
    expect((await checkPage(page, manifest)).errors, e.class).toEqual([]);
  }
});

test("a page that states its own styling and uses no shared UI is not checked against the shared layer", async () => {
  const page = '<html><head><meta name="own-style" content="project styles"><style>:root{--c:#123}.mine{color:var(--c)}</style></head><body><div class="mine" style="color:#f00">x</div><table><tr><td>1</td></tr></table></body></html>';
  const manifest = await loadManifest();
  const report = await checkPage(page, manifest);
  expect(report).toEqual({ errors: [], warnings: [] });
});

test("check reports a mistyped shared class and an undefined variable as errors", async () => {
  const page = `<html><body>${withCss}<div class="ui-nod" style="color:var(--ink)">x</div></body></html>`;
  const { errors } = await checkPage(page, await loadManifest());
  expect(errors.some((e) => e.includes("ui-nod"))).toBe(true);
  expect(errors.some((e) => e.includes("--ink"))).toBe(true);
});

test("slide footers must count to the real slide total, and placeholders are errors", async () => {
  const slide = (n: number, total: number) => `<section class="slide"><div class="foot"><span>s</span><span>${n} / ${total}</span></div></section>`;
  const manifest = await loadManifest();
  expect((await checkPage(slide(1, 2) + slide(2, 2), manifest)).warnings).toEqual([]);
  expect((await checkPage(slide(1, 3) + slide(2, 3), manifest)).warnings.length).toBeGreaterThan(0);
  expect((await checkPage("<p>@@TITLE@@</p>", manifest)).errors.length).toBe(1);
});

test("vague pointers and links to missing slides are warnings, never errors", async () => {
  const slide = '<section id="s1" class="slide"><p>Same cause as the next slide. <a class="ui-ref" href="#s9">Setup</a></p><div class="foot"><span>x</span><span>1 / 1</span></div></section>';
  const { errors, warnings } = await checkPage(`<body class="ui-root">${withCss}${slide}</body>`, await loadManifest());
  expect(errors).toEqual([]);
  expect(warnings.some((w) => w.includes("next slide"))).toBe(true);
  expect(warnings.some((w) => w.includes("slide 9"))).toBe(true);
  const clean = '<section id="s1" class="slide"><p>See <a class="ui-ref" href="#s1">Setup · slide 1</a>.</p><div class="foot"><span>x</span><span>1 / 1</span></div></section>';
  expect((await checkPage(`<body class="ui-root">${withCss}${clean}</body>`, await loadManifest())).warnings.filter((w) => !w.includes("linked from"))).toEqual([]);
});

test("a light theme and its dark partner define the same tokens", () => {
  const tokens = (css: string): string[] => [...new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!))].sort();
  const read = (name: string): string => readFileSync(new URL(`../assets/ui/themes/${name}.css`, import.meta.url), "utf8");
  for (const [light, dark] of [["paper", "paper-dark"], ["modern", "modern-dark"]] as const) {
    const lightCss = read(light);
    const darkCss = read(dark);
    expect(tokens(darkCss), `${dark} vs ${light}`).toEqual(tokens(lightCss));
  }
});

type Rgb = [number, number, number];

/** The hex colours a fixed-palette theme sets, by token name. */
function themeColours(name: string): Record<string, Rgb> {
  const source = readFileSync(new URL(`../assets/ui/themes/${name}.css`, import.meta.url), "utf8");
  const colours: Record<string, Rgb> = {};
  for (const m of source.matchAll(/(--[\w-]+):\s*#([0-9a-f]{6})\b/gi)) {
    const hex = m[2]!;
    colours[m[1]!] = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  return colours;
}

/** WCAG relative-luminance contrast ratio between two colours. */
function contrast(a: Rgb, b: Rgb): number {
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (c: Rgb): number => 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]);
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

test("every fixed-palette theme meets the quality floor: 4.5:1 for text and 3:1 for control borders", () => {
  const textPairs = [["--foreground", "--background"], ["--foreground", "--card"], ["--muted-foreground", "--background"], ["--muted-foreground", "--card"], ["--muted-foreground", "--muted"], ["--subtle", "--card"], ["--primary", "--card"], ["--primary-foreground", "--primary"], ["--destructive", "--card"], ["--warning", "--card"], ["--success", "--card"]] as const;
  const borderPairs = [["--input", "--card"], ["--input", "--background"]] as const;
  for (const theme of ["paper", "paper-dark", "modern", "modern-dark"]) {
    const colours = themeColours(theme);
    for (const [fg, bg] of textPairs) {
      const ratio = contrast(colours[fg]!, colours[bg]!);
      expect(ratio, `${theme} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    for (const [fg, bg] of borderPairs) {
      const ratio = contrast(colours[fg]!, colours[bg]!);
      expect(ratio, `${theme} ${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
    }
  }
});

test("a figure with no text alternative, a dangling number link, a skipped heading and tiny text are each a warning, never an error", async () => {
  const manifest = await loadManifest();
  const page = `<body class="ui-root">${withCss}<style>.x { font: 600 10px sans-serif }</style><h1>A</h1><h3>B</h3><div class="ui-range"><div class="ui-range-bar"></div></div><a class="ui-ref" href="#nowhere">64.7</a></body>`;
  const report = await checkPage(page, manifest);
  expect(report.errors).toEqual([]);
  expect(report.warnings.some((w) => w.includes("ui-range has no role"))).toBe(true);
  expect(report.warnings.some((w) => w.includes("#nowhere"))).toBe(true);
  expect(report.warnings.some((w) => w.includes("skip to h3"))).toBe(true);
  expect(report.warnings.some((w) => w.includes("below 11px"))).toBe(true);
});

test("figures built by figures.ts, headings in order and a link to a real id raise no warning", async () => {
  const manifest = await loadManifest();
  const bar = range({ min: 30, max: 100, lo: 64.7, hi: 78.4, at: 74, unit: " %", digits: 1, name: "Range" });
  const grid = waffle(74, 100, 20);
  const page = `<body class="ui-root">${withCss}<h1>A</h1><h2>B</h2>${bar}${grid}<span id="here">1</span><a class="ui-ref" href="#here">1</a></body>`;
  const report = await checkPage(page, manifest);
  expect(report.warnings.filter((w) => !w.includes("linked from"))).toEqual([]);
});

test("a page that inlines the shared CSS and the theme has no variable reported as used but never defined", async () => {
  const manifest = await loadManifest();
  const theme = readFileSync(new URL("../assets/ui/themes/modern.css", import.meta.url), "utf8");
  const page = `<html data-ui-theme="modern"><head><style>${theme}${components}</style></head><body class="ui-root"><h1>A</h1><p class="ui-card">x</p></body></html>`;
  const report = await checkPage(page, manifest);
  expect(report.errors).toEqual([]);
});

test("an interactive component is flagged only when its class is used, not when inlined CSS merely names it", async () => {
  const manifest = await loadManifest();
  const unused = `<html><head><style>${components}</style></head><body class="ui-root"><p class="ui-card">x</p></body></html>`;
  const unusedReport = await checkPage(unused, manifest);
  expect(unusedReport.warnings.filter((w) => w.includes("is interactive"))).toEqual([]);
  const used = `<html><head><style>${components}</style></head><body class="ui-root"><div class="ui-work"><section>x</section><section>y</section></div></body></html>`;
  const usedReport = await checkPage(used, manifest);
  expect(usedReport.warnings.some((w) => w.includes("ui-work is interactive"))).toBe(true);
});

test("the page template, once its placeholders are filled, passes the shared UI check", async () => {
  const manifest = await loadManifest();
  const source = readFileSync(new URL("../templates/page.html", import.meta.url), "utf8");
  const filled = source.replace(/@@[^@]*@@/g, "x");
  const report = await checkPage(filled, manifest);
  expect(report.errors).toEqual([]);
  expect(report.warnings.filter((w) => !w.includes("linked from"))).toEqual([]);
});

test("a full page with none of the shared layer is a warning unless it states why; a fragment is left alone", async () => {
  const manifest = await loadManifest();
  const own = "<!doctype html><html><head><style>body { color: #222 }</style></head><body><h1>A</h1></body></html>";
  const withReason = own.replace("<head>", '<head><meta name="own-style" content="Prototype in the shop styles">');
  const withBlankReason = own.replace("<head>", '<head><meta name="own-style" content="">');
  const withTheme = own.replace("<html>", '<html data-ui-theme="modern">');
  const flagged = (report: { warnings: string[] }): boolean => report.warnings.some((w) => w.includes("none of the shared layer"));

  const bare = await checkPage(own, manifest);
  const reasoned = await checkPage(withReason, manifest);
  const blank = await checkPage(withBlankReason, manifest);
  const themed = await checkPage(withTheme, manifest);
  const fragment = await checkPage("<h2>A</h2><p>text</p>", manifest);

  expect(bare.errors).toEqual([]);
  expect(flagged(bare)).toBe(true);
  expect(flagged(reasoned)).toBe(false);
  expect(flagged(blank)).toBe(true);
  expect(flagged(themed)).toBe(false);
  expect(fragment.warnings).toEqual([]);
});

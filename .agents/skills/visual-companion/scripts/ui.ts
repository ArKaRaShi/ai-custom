/**
 * Reads assets/ui/components.json, the contract for the shared UI layer.
 *   bun scripts/ui.ts list                 one line per component
 *   bun scripts/ui.ts show <name|class>    use, modifiers, structure and a snippet to paste
 *   bun scripts/ui.ts check <page.html>    lint a page; exit 1 only on errors, warnings never fail
 * Using the shared UI is optional. `check` flags mistakes in what a page does use; it never requires the layer.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export type Entry = { class: string; also?: string[]; states?: string[]; mode: "static" | "both"; script?: string; modifiers?: string[]; where?: string; children?: string; use: string; snippet: string };
export type Manifest = { components: Record<string, Entry>; layout: Record<string, Entry> };
export type Report = { errors: string[]; warnings: string[] };

const UI_DIR = join(import.meta.dir, "..", "assets", "ui");

/** Drops `$comment` keys, which document the file and are not components. */
export async function loadManifest(): Promise<Manifest> {
  const raw = JSON.parse(await readFile(join(UI_DIR, "components.json"), "utf8")) as Record<string, Record<string, Entry>>;
  const entries = (group: Record<string, Entry>): Record<string, Entry> => Object.fromEntries(Object.entries(group).filter(([k]) => !k.startsWith("$")));
  return { components: entries(raw.components!), layout: entries(raw.layout!) };
}

/** Custom properties defined by the shared layer: components.css, the default theme, and the page's named theme. */
async function sharedVars(theme: string | undefined): Promise<Set<string>> {
  const files = ["components.css", "themes/indigo.css", ...(theme ? [`themes/${theme}.css`] : [])];
  const vars = new Set<string>();
  for (const f of files) {
    const css = await readFile(join(UI_DIR, f), "utf8").catch(() => "");
    for (const m of css.matchAll(/(--[\w-]+)\s*:/g)) vars.add(m[1]!);
  }
  return vars;
}

export async function checkPage(source: string, manifest: Manifest): Promise<Report> {
  const html = source.replace(/<!--[\s\S]*?-->/g, "");
  const errors: string[] = [];
  const warnings: string[] = [];
  const base = new Map<string, Entry>();
  for (const e of Object.values(manifest.components)) base.set(e.class, e);
  const generated = new Set(Object.values(manifest.components).flatMap((e) => e.also ?? []));
  const allModifiers = new Set([...base.values()].flatMap((e) => e.modifiers ?? []));

  const theme = /data-ui-theme="([\w-]+)"/.exec(html)?.[1];
  const usesUi = /data-ui-theme=|\bclass="[^"]*\bui-|\/assets\/ui\//.test(html);

  if (html.includes("@@")) errors.push("unfilled @@placeholder@@ left in the page");

  // Custom properties: every var(--x) without a fallback must be defined by the page or the shared layer.
  const defined = new Set([...html.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!));
  if (usesUi) for (const v of await sharedVars(theme)) defined.add(v);
  const undefinedVars = new Set<string>();
  for (const m of html.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) if (!defined.has(m[1]!)) undefinedVars.add(m[1]!);
  for (const v of undefinedVars) errors.push(`var(${v}) is used but never defined`);

  // Slide footers: "n / N" must count up to the real slide count.
  const slides = (html.match(/<section\b[^>]*\bclass="slide[\s"]/g) ?? []).length;
  if (slides > 0) {
    const footers = [...html.matchAll(/class="foot"[^>]*>[\s\S]*?<span>\s*(\d+)\s*\/\s*(\d+)\s*<\/span>\s*<\/div>/g)];
    footers.forEach((m, i) => {
      if (Number(m[2]) !== slides || Number(m[1]) !== i + 1) warnings.push(`footer ${i + 1} says "${m[1]} / ${m[2]}" but the page has ${slides} slides`);
    });
    if (footers.length && footers.length !== slides) warnings.push(`${footers.length} of ${slides} slides have a numbered footer`);
  }

  // Advisory only: vague pointers make the reader hunt. Name the target and link it with ui-ref.
  const prose = html.replace(/<(script|style|pre)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
  const vague = new Set([...prose.matchAll(/\b(next slide|previous slide|last slide|see above|see below|as above|as below)\b/gi)].map((m) => m[1]!.toLowerCase()));
  for (const v of vague) warnings.push(`"${v}" makes the reader hunt; name the target, for example <a class="ui-ref" href="#s4">Setup · slide 4</a>`);
  if (slides > 0) for (const m of html.matchAll(/\bclass="[^"]*\bui-ref\b[^"]*"[^>]*\bhref="#s?(\d+)"|\bhref="#s?(\d+)"[^>]*\bclass="[^"]*\bui-ref\b/g)) {
    const n = Number(m[1] ?? m[2]);
    if (n < 1 || n > slides) warnings.push(`a ui-ref points to slide ${n} but the page has ${slides} slides`);
  }

  if (!usesUi) {
    // A full document that ignores the shared layer must say why, in the file, so the choice is deliberate.
    const fullDocument = /<html\b|<body\b/i.test(html);
    const ownStyle = /<meta\b[^>]*\bname="own-style"[^>]*\bcontent="[^"]*\S[^"]*"/i.test(html);
    if (fullDocument && !ownStyle) warnings.push('the page uses none of the shared layer (no ui- class, theme or /assets/ui link); start from templates/page.html, or say why it keeps its own look with <meta name="own-style" content="reason">, for example a Prototype in the project\'s styles');
    return { errors, warnings };
  }

  const hasCss = /\/assets\/ui\/components\.css|\.ui-card\s*\{/.test(html);
  const linked = /\/assets\/ui\//.test(html);
  if (!hasCss) errors.push("ui-* classes are used but components.css is neither linked nor inlined");
  if (linked) warnings.push("shared CSS is linked from /assets/ui, so the file works only through the companion; run scripts/inline-ui.ts for a standalone file");
  if (!/<body\b[^>]*\bclass="[^"]*\bui-root\b/.test(html)) warnings.push('<body> lacks class="ui-root" (page base colour and font)');

  for (const m of html.matchAll(/\bclass="([^"]*)"/g)) {
    const tokens = m[1]!.split(/\s+/).filter(Boolean);
    const bases = tokens.filter((t) => t.startsWith("ui-"));
    for (const t of bases) if (!base.has(t) && !generated.has(t)) errors.push(`unknown class ${t} (the ui- prefix is reserved for shared components; give your own classes another prefix)`);
    const allowed = new Set(bases.flatMap((b) => base.get(b)?.modifiers ?? []));
    if (bases.length) for (const t of tokens) if (allModifiers.has(t) && !allowed.has(t)) warnings.push(`"${t}" is not a modifier of ${bases.join(" ")}`);
  }

  for (const m of html.matchAll(/<table\b([^>]*)>/g)) if (!/\bclass="[^"]*\bui-table\b/.test(m[1]!)) { warnings.push("a <table> has no ui-table class, so it is unstyled by the shared layer"); break; }

  const markup = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  // A class counts as used only in an element's class attribute: inlined CSS names every component, so searching the whole file would flag them all.
  const interactive = Object.values(manifest.components).filter((e) => e.script && new RegExp(`\\bclass="[^"]*\\b${e.class}\\b`).test(markup));
  for (const e of interactive) if (!new RegExp(`/assets/ui/${e.script}|window\\.uiReveal`).test(html)) warnings.push(`${e.class} is interactive but ${e.script} is not linked or inlined; it renders in its static form`);

  if (/\bclass="[^"]*\bui-trace\b/.test(markup)) {
    for (const m of markup.matchAll(/<output\b[^>]*>/g)) {
      if (!/\bdata-ran=/.test(m[0])) { warnings.push("an <output> in a ui-trace has no data-ran, so nothing says a real run printed it; build the block with scripts/trace.ts"); break; }
    }
  }

  // Figures that carry a value need a text alternative; scripts/figures.ts writes one.
  for (const m of markup.matchAll(/<div\b[^>]*\bclass="[^"]*(?<![\w-])(ui-range|ui-waffle)(?![\w-])[^"]*"[^>]*>/g)) {
    if (!/\brole="img"/.test(m[0]) || !/\baria-label=/.test(m[0])) { warnings.push(`a ${m[1]} has no role="img" and aria-label, so a screen reader gets nothing; build it with scripts/figures.ts`); break; }
  }

  // A replay's axis needs a text alternative, and it has one tick per event.
  for (const m of markup.matchAll(/<div\b([^>]*\bclass="[^"]*\bui-replay-axis\b[^"]*"[^>]*)>([\s\S]*?)<\/div>\s*((?:<section\b[\s\S]*?<\/section>\s*)+)/g)) {
    const axisTag = m[1]!;
    if (!/\brole="img"/.test(axisTag) || !/\baria-label=/.test(axisTag)) { warnings.push("a ui-replay-axis has no role=\"img\" and aria-label, so a screen reader gets nothing; build it with scripts/figures.ts replay"); break; }
    const ticks = m[2]!.match(/<i\b/g)?.length ?? 0;
    const events = m[3]!.match(/<section\b/g)?.length ?? 0;
    if (ticks !== events) { warnings.push(`a ui-replay has ${ticks} ticks but ${events} events; they should match`); break; }
  }

  // A ui-ref that is not a slide link must point at an element that exists (a script may create it, so search the whole source).
  for (const m of markup.matchAll(/\bclass="[^"]*\bui-ref\b[^"]*"[^>]*\bhref="#([\w-]+)"|\bhref="#([\w-]+)"[^>]*\bclass="[^"]*\bui-ref\b/g)) {
    const id = m[1] ?? m[2]!;
    if (!/^s\d+$/.test(id) && !html.includes(`id="${id}"`)) warnings.push(`a ui-ref points to #${id} but no element has that id`);
  }

  const levels = [...markup.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
  const skipped = levels.find((level, i) => i > 0 && level > levels[i - 1]! + 1);
  if (skipped !== undefined) warnings.push(`heading levels skip to h${skipped}; keep them in order (h1, h2, h3) so screen readers can navigate`);

  const small = [...html.matchAll(/\bfont(?:-size)?\s*:[^;}"]*?\b(\d+(?:\.\d+)?)px/g)].find((m) => Number(m[1]) < 11);
  if (small) warnings.push(`text is sized below 11px (${small[0].trim()}); functional text should be at least 11px`);

  const colorInStyle = [...html.matchAll(/\bstyle="([^"]*)"/g)].some((m) => /#[0-9a-f]{3,8}\b|rgba?\(/i.test(m[1]!));
  if (colorInStyle) warnings.push("a style attribute hard-codes a colour; var(--primary), var(--foreground) and the other tokens follow the theme");
  return { errors, warnings };
}

function describe(name: string, e: Entry): string {
  const lines = [`${name}  .${e.class}  [${e.mode}${e.script ? `, script: ${e.script}` : ""}]`, `  ${e.use}`];
  if (e.where) lines.push(`  on: ${e.where}`);
  if (e.modifiers?.length) lines.push(`  modifiers: ${e.modifiers.join(", ")}`);
  if (e.states?.length) lines.push(`  set by the script, do not write: ${e.states.join(", ")}`);
  if (e.children) lines.push(`  structure: ${e.children}`);
  lines.push("  snippet:", `    ${e.snippet}`);
  return lines.join("\n");
}

async function main(argv: string[]): Promise<number> {
  const [cmd, arg] = argv;
  const manifest = await loadManifest();
  const all: [string, Entry][] = [...Object.entries(manifest.components), ...Object.entries(manifest.layout)];
  if (cmd === "list") {
    for (const [name, e] of all) console.log(`${name.padEnd(10)} .${e.class.padEnd(14)} ${e.use.split(/(?<=\.) /)[0]}`);
    return 0;
  }
  if (cmd === "show" && arg) {
    const hit = all.find(([n, e]) => n === arg || e.class === arg || e.class === `ui-${arg}`);
    if (!hit) { console.error(`no component "${arg}"; run: ui.ts list`); return 2; }
    console.log(describe(...hit));
    return 0;
  }
  if (cmd === "check" && arg) {
    const { errors, warnings } = await checkPage(await readFile(arg, "utf8"), manifest);
    for (const e of errors) console.log(`error: ${e}`);
    for (const w of warnings) console.log(`warn: ${w}`);
    console.log(errors.length || warnings.length ? `${errors.length} error(s), ${warnings.length} warning(s)` : "ok");
    return errors.length ? 1 : 0;
  }
  console.error("usage: ui.ts list | show <name> | check <page.html>");
  return 2;
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));

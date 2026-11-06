import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Catalogue, Entry } from "./catalogue";
import type { Mode } from "./domain";
import { parseAttributes } from "./markup";
import { DIAGRAM_KINDS } from "../assets/components/layout/kinds.js";

export const ASSETS_DIR = join(import.meta.dir, "..", "assets");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

export function mimeFor(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot < 0 ? "application/octet-stream" : (MIME[path.slice(dot).toLowerCase()] ?? "application/octet-stream");
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const CLIENT_TAG = '<script src="/assets/client.js" defer></script>';
const MODULE_TAG = '<script type="module" src="/assets/components/index.js"></script>';
const STYLE_TAG = '<link rel="stylesheet" href="/assets/components.css">';

/** Browser chrome colors: the --vc-bg of each palette in components.css, which tests/render.test.ts
 *  reads back from the CSS so the two cannot drift. frame.html carries the same literals. */
const THEME_COLOR = { light: "#f6f6f7", dark: "#14161a" } as const;

/** What a `data-vc-components` value means for the palette. The tokens follow the OS scheme,
 *  but a plain page does not, so the server pins the palette unless the author says "auto":
 *  a dark OS under a light page would otherwise put light-grey muted text on white. */
type Scheme = "light" | "dark" | "auto";

function blankOut(match: string): string {
  return " ".repeat(match.length);
}

/** Comments, scripts and styles blanked (same length), so offsets stay valid in the original. */
function maskInert(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, blankOut)
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, blankOut);
}

/** The palette a page ends up in: pinned light or dark, or following the OS. The CSS follows the OS
 *  for any `data-vc-theme` value other than exactly "light" or "dark". */
type Palette = "light" | "dark" | "os";

/** The opt-in lives on the `<html>` tag only: not in a comment, a script, body text or another tag. */
function findOptIn(html: string): { tagEnd: number; htmlTagStart: number; scheme: Scheme; hasTheme: boolean; palette: Palette } | null {
  const masked = maskInert(html);
  const tag = /<html\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/i.exec(masked);
  if (!tag) return null;
  const attrs = parseAttributes(tag[1] ?? "");
  const value = attrs["data-vc-components"];
  if (value === undefined) return null;
  const scheme: Scheme = value.toLowerCase() === "dark" ? "dark" : value.toLowerCase() === "auto" ? "auto" : "light";
  const ownTheme = attrs["data-vc-theme"];
  const palette: Palette =
    ownTheme !== undefined ? (ownTheme === "light" || ownTheme === "dark" ? ownTheme : "os") : scheme === "auto" ? "os" : scheme;
  return { htmlTagStart: tag.index, tagEnd: tag.index + tag[0].length, scheme, hasTheme: ownTheme !== undefined, palette };
}

/** A real `<meta name="theme-color">` element: not one in a comment, a script or a style, and not
 *  text inside another tag's attribute. Names compare ASCII case-insensitively, as browsers do. */
function hasThemeColor(html: string): boolean {
  const masked = maskInert(html);
  for (const tag of masked.matchAll(/<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g)) {
    const attrs = parseAttributes(tag[2] ?? "");
    if (tag[1]?.toLowerCase() === "meta" && attrs["name"]?.toLowerCase() === "theme-color") return true;
  }
  return false;
}

/** A pinned palette paints its own color whatever the OS says; a page that follows the OS gets one
 *  tag per scheme, so the browser picks the one that matches. */
function themeColorTags(palette: Palette): string {
  if (palette !== "os") return `<meta name="theme-color" content="${THEME_COLOR[palette]}">`;
  return (["light", "dark"] as const)
    .map((scheme) => `<meta name="theme-color" media="(prefers-color-scheme: ${scheme})" content="${THEME_COLOR[scheme]}">`)
    .join("");
}

/**
 * Plain mode makes a document's choices reportable and, only when it asks, gives it the
 * component layer.
 *
 *   default                       document + client.js (nothing else changes, byte for byte)
 *   <html data-vc-components>     + components.css right after the <html> tag, + the element
 *                                 module ahead of client.js, + data-vc-theme pinned on <html>
 *                                 ("light" by default, "dark", or none for "auto"), + a theme-color
 *                                 meta right after the stylesheet unless the document has its own:
 *                                 one unconditional tag for a pinned palette, one per
 *                                 prefers-color-scheme for "auto"
 *   scripts: false                isolated previews run under a CSP with no script source:
 *                                 no client.js and no module tag, and the stylesheet only on opt-in
 *
 * The attribute is the only trigger. It is never inferred from `vc-` markup, because a product
 * page may use `vc-` names of its own.
 */
export function withClient(html: string, options: { scripts: boolean }): string {
  if (html.includes("/assets/client.js")) return html;
  const optIn = findOptIn(html);

  let result = html;
  if (optIn) {
    const pin = optIn.scheme === "auto" || optIn.hasTheme ? "" : ` data-vc-theme="${optIn.scheme}"`;
    const color = hasThemeColor(html) ? "" : themeColorTags(optIn.palette);
    // Insert at the later offset first so the earlier one stays valid.
    result = `${html.slice(0, optIn.tagEnd)}${STYLE_TAG}${color}${html.slice(optIn.tagEnd)}`;
    result = `${result.slice(0, optIn.htmlTagStart + 5)}${pin}${result.slice(optIn.htmlTagStart + 5)}`;
  }
  if (!options.scripts) return result;

  const tags = optIn ? `${MODULE_TAG}\n${CLIENT_TAG}` : CLIENT_TAG;
  return result.includes("</body>") ? result.replace("</body>", () => `${tags}\n</body>`) : `${result}\n${tags}`;
}

async function frame(title: string, content: string): Promise<string> {
  const shell = await readFile(join(ASSETS_DIR, "frame.html"), "utf8");
  return shell
    .replaceAll("<!--VC:TITLE-->", () => escapeHtml(title))
    .replace("<!--VC:CONTENT-->", () => content);
}

export async function renderScreen(options: {
  mode: Mode;
  title: string;
  content: string;
  isolated?: boolean;
}): Promise<string> {
  if (options.isolated) {
    if (options.mode === "plain") return withClient(options.content, { scripts: false });
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(options.title)}</title><link rel="stylesheet" href="/assets/components.css"></head><body class="vc-body"><main class="vc-main">${options.content}</main></body></html>`;
  }
  if (options.mode === "plain") return withClient(options.content, { scripts: true });
  return frame(options.title, options.content);
}

/** One long bundle page: every part stacked as a section, with a thin section rail that only scrolls. */
export function composePage(parts: { name: string; html: string }[]): string {
  const sections = parts.map((part, i) => `<section class="vc-part" id="vc-part-${i + 1}" aria-labelledby="vc-part-${i + 1}-title"><h2 class="vc-part-title" id="vc-part-${i + 1}-title">${escapeHtml(part.name)}</h2>${part.html}</section>`).join("");
  return `<div class="vc-page"><vc-contents variant="rail"></vc-contents><div class="vc-page-body">${sections}</div></div>`;
}

/** One specimen per entry: its names, what it is for, the live snippet, and the snippet's source. */
export function specimen(entry: Entry): string {
  const names = entry.names.map((name) => `<code>${escapeHtml(name)}</code>`).join(" / ");
  const diagramKinds = entry.names.includes("vc-diagram")
    ? `<p class="vc-muted">Diagram kinds: ${DIAGRAM_KINDS.join(", ")}.</p>`
    : "";
  return [
    '<div class="vc-card">',
    `<div class="vc-card-head"><h3 class="vc-h2">${names}</h3><span class="vc-badge">${entry.kind}</span></div>`,
    `<p class="vc-muted">${escapeHtml(entry.what)}</p>`,
    diagramKinds,
    `<div class="vc-stack"><div class="vc-stack">${entry.snippet}</div>`,
    `<vc-code><pre class="vc-pre"><code>${escapeHtml(entry.snippet)}</code></pre></vc-code></div>`,
    "</div>",
  ].join("");
}

/**
 * The component gallery: one part per catalogue group, in catalogue order, one specimen per entry.
 * The specimen IS the entry's snippet, so "the gallery shows every entry" holds by construction.
 */
export function renderGallery(catalogue: Catalogue): string {
  const parts = catalogue.groups.map((group) => ({
    name: group.title,
    html: catalogue.entries.filter((entry) => entry.group === group.id).map(specimen).join(""),
  }));
  return composePage(parts);
}

export async function emptyState(): Promise<string> {
  return frame(
    "Visual companion",
    [
      '<section class="vc-empty" data-vc-empty>',
      '  <h1 class="vc-h1">Waiting for a screen</h1>',
      '  <p class="vc-muted" data-vc-empty-copy>When your companion shares something, it will appear here automatically.</p>',
      "</section>",
    ].join("\n"),
  );
}

export function forbiddenPage(): string {
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8"><title>Session key required</title>',
    '<meta name="viewport" content="width=device-width, initial-scale=1"></head>',
    '<body style="font:16px/1.5 system-ui,sans-serif;padding:3rem;max-width:34rem">',
    "<h1>Session key required</h1>",
    "<p>Open the full URL that includes <code>?key=…</code>, or ask the agent for it again.</p>",
    "</body></html>",
  ].join("");
}

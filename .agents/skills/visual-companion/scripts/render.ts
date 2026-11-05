import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Mode } from "./domain";

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

/** Plain mode: never restyle the document, only make its choices reportable. */
function withClient(html: string): string {
  if (html.includes("/assets/client.js")) return html;
  return html.includes("</body>") ? html.replace("</body>", `${CLIENT_TAG}\n</body>`) : `${html}\n${CLIENT_TAG}`;
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
    if (options.mode === "plain") return options.content;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(options.title)}</title><link rel="stylesheet" href="/assets/components.css"></head><body class="vc-body"><main class="vc-main">${options.content}</main></body></html>`;
  }
  if (options.mode === "plain") return withClient(options.content);
  return frame(options.title, options.content);
}

/** One long bundle page: every part stacked as a section, with a thin section rail that only scrolls. */
export function composePage(parts: { name: string; html: string }[]): string {
  const links = parts.map((part, i) => `<li><a href="#vc-part-${i + 1}" aria-label="${i + 1}. ${escapeHtml(part.name)}"><span class="vc-toc-num">${i + 1}</span><span class="vc-toc-name">${escapeHtml(part.name)}</span></a></li>`).join("");
  const sections = parts.map((part, i) => `<section class="vc-part" id="vc-part-${i + 1}" aria-labelledby="vc-part-${i + 1}-title"><h2 class="vc-part-title" id="vc-part-${i + 1}-title"><span class="vc-toc-num">${i + 1}</span>${escapeHtml(part.name)}</h2>${part.html}</section>`).join("");
  return `<div class="vc-page"><nav class="vc-toc" aria-label="Sections"><ol>${links}</ol></nav><div class="vc-page-body">${sections}</div></div>`;
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

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

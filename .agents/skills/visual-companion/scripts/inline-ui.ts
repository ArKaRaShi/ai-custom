/** Replaces each <link rel="stylesheet" href="/assets/ui/..."> and <script src="/assets/ui/..."> in an HTML file with its content, so the file opens without the companion.
 *  Usage: bun scripts/inline-ui.ts <in.html> <out.html> */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error("usage: inline-ui.ts <in.html> <out.html>"); process.exit(2); }
const assets = join(import.meta.dir, "..", "assets");
const links = /<link\b[^>]*\bhref="\/assets\/(ui\/[\w./-]+\.css)"[^>]*>|<script\b[^>]*\bsrc="\/assets\/(ui\/[\w./-]+\.js)"[^>]*><\/script>/g;
const html = await readFile(input, "utf8");
const parts = [...html.matchAll(links)];
let out = html;
for (const m of parts) {
  const css = m[1];
  const body = await readFile(join(assets, (css ?? m[2])!), "utf8");
  out = out.replace(m[0], css ? `<style>\n${body}</style>` : `<script>\n${body}</script>`);
}
await writeFile(output, out);
console.log(`inlined ${parts.length} file(s) -> ${output}`);

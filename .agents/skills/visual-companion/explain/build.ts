/**
 * Rebuilds the committed Explain artifacts from this folder:
 * the browser renderer and its styles under `assets/explain/`,
 * the CLI's lesson module under `dist/`, and `lesson.schema.json`.
 * Run after changing anything here: `bun explain/build.ts` from the skill folder.
 */
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import tailwind from "bun-plugin-tailwind";
import { lessonJsonSchema } from "./lesson";

const src = import.meta.dir;
const out = join(src, "..", "assets", "explain");

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const browser = await Bun.build({
  entrypoints: [join(src, "app.tsx")],
  outdir: out,
  naming: { entry: "renderer.[ext]", asset: "[name].[ext]" },
  target: "browser",
  minify: true,
  plugins: [tailwind],
  define: { "process.env.NODE_ENV": '"production"' },
});
const cli = await Bun.build({ entrypoints: [join(src, "lesson.ts")], outdir: join(src, "dist"), target: "bun" });
for (const result of [browser, cli]) {
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
}

const katex = join(src, "node_modules", "katex", "dist");
await cp(join(katex, "katex.min.css"), join(out, "katex.min.css"));
await cp(join(katex, "fonts"), join(out, "fonts"), { recursive: true });

const schemaPath = join(src, "lesson.schema.json");
const schemaJson = JSON.stringify(lessonJsonSchema(), null, 2);
await writeFile(schemaPath, `${schemaJson}\n`);
const built = browser.outputs.map((o) => o.path.slice(out.length + 1));
console.log(built.join(", "));

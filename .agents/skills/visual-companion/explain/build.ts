/**
 * Rebuilds the committed Explain artifacts from this folder:
 * the browser renderer and its styles under `assets/explain/`,
 * the CLI's lesson module under `explain/dist/`, and `explain/lesson.schema.json`.
 * Run after changing anything here: `bun explain/build.ts` from the skill folder.
 * `--out <dir>` writes the same layout under another root; the freshness test uses it.
 */
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import tailwind from "bun-plugin-tailwind";
import { lessonJsonSchema } from "./lesson";

const src = import.meta.dir;
// Bundle comments name module paths relative to the working directory; fix it so builds are byte-identical.
process.chdir(src);
// Tailwind emits different CSS outside production; pin it so a build under `bun test` matches.
process.env.NODE_ENV = "production";
const outFlag = process.argv.indexOf("--out");
const root = outFlag >= 0 ? resolve(process.argv[outFlag + 1] ?? "") : join(src, "..");
const assets = join(root, "assets", "explain");

await rm(assets, { recursive: true, force: true });
await mkdir(assets, { recursive: true });

const browser = await Bun.build({
  entrypoints: [join(src, "app.tsx")],
  outdir: assets,
  naming: { entry: "renderer.[ext]", asset: "[name].[ext]" },
  target: "browser",
  minify: true,
  plugins: [tailwind],
  define: { "process.env.NODE_ENV": '"production"' },
});
const cli = await Bun.build({ entrypoints: [join(src, "lesson.ts")], outdir: join(root, "explain", "dist"), target: "bun" });
for (const result of [browser, cli]) {
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
}

const katex = join(src, "node_modules", "katex", "dist");
await cp(join(katex, "katex.min.css"), join(assets, "katex.min.css"));
await cp(join(katex, "fonts"), join(assets, "fonts"), { recursive: true });

const schemaPath = join(root, "explain", "lesson.schema.json");
const schemaJson = JSON.stringify(lessonJsonSchema(), null, 2);
await writeFile(schemaPath, `${schemaJson}\n`);
const built = browser.outputs.map((o) => o.path.slice(assets.length + 1));
console.log(built.join(", "));

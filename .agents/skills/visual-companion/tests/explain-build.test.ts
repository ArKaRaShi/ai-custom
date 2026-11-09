import { afterAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const skill = join(import.meta.dir, "..");
const explainDir = join(skill, "explain");
// Agents read the schema and the CLI runs dist/lesson.js, so both must match the source in explain/.
const ARTIFACTS = ["explain/lesson.schema.json", "explain/dist/lesson.js", "assets/explain/renderer.js", "assets/explain/renderer.css"];

let out = "";
afterAll(async () => {
  if (out) await rm(out, { recursive: true, force: true });
});

// Needs explain/node_modules (run `bun install` in explain/); skipped on a clone that only uses the prebuilt files.
describe("given the committed Explain artifacts, when explain/ is rebuilt, then nothing changes", () => {
  test.skipIf(!existsSync(join(explainDir, "node_modules")))("the schema, CLI module and renderer match a fresh build", async () => {
    out = await mkdtemp(join(tmpdir(), "vc-explain-build-"));
    const build = Bun.spawn(["bun", join(explainDir, "build.ts"), "--out", out], { cwd: explainDir, stdout: "pipe", stderr: "pipe" });
    const stderr = await new Response(build.stderr).text();
    expect(await build.exited, stderr).toBe(0);

    const stale: string[] = [];
    for (const artifact of ARTIFACTS) {
      const fresh = await readFile(join(out, artifact), "utf8");
      const committedPath = join(skill, artifact);
      const committed = existsSync(committedPath) ? await readFile(committedPath, "utf8") : "";
      if (fresh !== committed) stale.push(artifact);
    }
    expect(stale, "stale artifacts: run `bun explain/build.ts` in the skill folder").toEqual([]);
  }, 120_000);
});

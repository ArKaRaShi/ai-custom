import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "..", "scripts", "cli.ts");

test("detached server preserves paths containing spaces and apostrophes", async () => {
  const prefix = join(tmpdir(), "vc launch's ");
  const root = await mkdtemp(prefix);
  const runDir = join(root, "run dir's");
  try {
    const start = Bun.spawn(["bun", CLI, "start", "--run-dir", runDir, "--host", "127.0.0.1", "--json"], { stdout: "pipe", stderr: "pipe" });
    const out = await new Response(start.stdout).text();
    const err = await new Response(start.stderr).text();
    expect(await start.exited).toBe(0);
    expect(err).toBe("");
    const info = JSON.parse(out) as { runDir: string; url: string };
    expect(info.runDir).toBe(runDir);
    const response = await fetch(info.url);
    expect(response.status).toBe(200);
  } finally {
    const stop = Bun.spawn(["bun", CLI, "stop", "--run-dir", runDir], { stdio: ["ignore", "ignore", "ignore"] });
    await stop.exited;
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

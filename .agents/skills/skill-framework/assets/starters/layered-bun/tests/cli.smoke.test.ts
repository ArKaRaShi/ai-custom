import { expect, test } from "bun:test";
import { join } from "node:path";

const cli = join(import.meta.dir, "../scripts/cli.ts");
const run = (...args: string[]) => Bun.spawnSync(["bun", cli, ...args]);

test("the real entry point greets and exits 0", () => {
  const result = run("sam");
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe("✔ hello sam\n");
});

test("a missing argument exits 1 with a pointer", () => {
  const result = run();
  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toContain("Run 'greet --help'");
});

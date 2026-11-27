/** Pin the check through its real entry point: one hit, one silence, one exemption. */
import { afterAll, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHECK_SCRIPT = join(import.meta.dir, "..", "check-no-console-log.ts")
const root = mkdtempSync(join(tmpdir(), "check-no-console-log-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))

function runCheck(name: string, source: string): { exitCode: number; stdout: string } {
  const file = join(root, name)
  writeFileSync(file, source)
  const result = Bun.spawnSync(["bun", CHECK_SCRIPT, file])
  return { exitCode: result.exitCode, stdout: result.stdout.toString() }
}

test("a hit names the rule, line and doc", () => {
  const result = runCheck("hit.ts", 'export function handle(): void {\n  console.log("done")\n}\n')

  expect(result.exitCode).toBe(1)
  expect(result.stdout).toContain("hit.ts:2:3: error [no-console-log/no-console-log] calls `console.log`")
  expect(result.stdout.trimEnd().endsWith("(docs/conventions/logging.md#the-pattern)")).toBe(true)
})

test("legitimate code stays silent", () => {
  const result = runCheck("silent.ts", 'logger.info("console.log")\nconsole.error("failed")\n')

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toBe("")
})

test("a reasoned suppression exempts the line and a bare one does not", () => {
  const reasoned = runCheck("reasoned.ts", 'console.log("x") // no-console-log-ok: CLI output\n')
  const bare = runCheck("bare.ts", 'console.log("x") // no-console-log-ok:\n')

  expect(reasoned.exitCode).toBe(0)
  expect(bare.exitCode).toBe(1)
})

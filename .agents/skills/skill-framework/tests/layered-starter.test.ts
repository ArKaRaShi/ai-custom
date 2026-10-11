import { afterEach, describe, expect, it } from "bun:test";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const framework = join(import.meta.dir, "..");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function copySkeleton(): string {
  const root = mkdtempSync(join(tmpdir(), "layered-starter-"));
  roots.push(root);
  cpSync(join(framework, "assets/starters/layered-bun"), root, { recursive: true });
  return root;
}

const guard = (root: string) =>
  Bun.spawnSync(["bun", join(framework, "scripts/layer-guard.ts"), join(root, "scripts")]);

describe("given the layered starter, when copied into a new skill, then it follows its own contract", () => {
  it("passes the layer guard and its own tests", () => {
    const root = copySkeleton();
    expect(guard(root).exitCode).toBe(0);
    const tests = Bun.spawnSync(["bun", "test"], { cwd: root });
    expect(tests.exitCode).toBe(0);
    expect(tests.stderr.toString()).toContain("Ran 3 tests across 2 files");
  });

  it("fails the guard when a domain file reaches for the file system", () => {
    const root = copySkeleton();
    writeFileSync(join(root, "scripts/domain/leak.ts"), 'import { readFileSync } from "node:fs";\nexport const leak = readFileSync;\n');
    const result = guard(root);
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toContain("domain/leak.ts:1 no-io-import");
  });
});

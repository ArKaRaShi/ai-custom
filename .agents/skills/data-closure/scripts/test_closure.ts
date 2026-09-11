#!/usr/bin/env bun
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateManifest } from "./manifest";
import { validateManualManifest } from "./safety";

const closureScript = join(import.meta.dir, "closure.ts");

async function runCli(...args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const process = Bun.spawn(["bun", closureScript, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { exitCode, stdout, stderr };
}

async function writeFakeAdapter(path: string, sourceAccess = "read_only"): Promise<void> {
  await writeFile(
    path,
    `import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const args = Bun.argv.slice(2);
const command = args[0];
const outputIndex = args.indexOf("--output");
const bundleIndex = args.indexOf("--bundle");
const output = args[(outputIndex >= 0 ? outputIndex : bundleIndex) + 1];

if (command === "plan") {
  await mkdir(dirname(output), { recursive: true });
  await Bun.write(
    output,
    JSON.stringify({
      schema_version: 1,
      source: { access: "${sourceAccess}", host_class: "test" },
      target: { host: "127.0.0.1", database: "test-target", class: "local" }
    }, null, 2)
  );
} else if (command === "export") {
  await mkdir(output, { recursive: true });
  const content = "sample\\n";
  await Bun.write(join(output, "base.json"), content);
  await Bun.write(
    join(output, "manifest.json"),
    JSON.stringify({
      schema_version: 1,
      run_id: "test-run",
      source: "test",
      files: [{ path: "base.json", kind: "base", rows: 1, sha256: createHash("sha256").update(content).digest("hex") }],
      natural_keys: [["id"]]
    }, null, 2)
  );
} else if (command === "prepare-manual") {
  await mkdir(output, { recursive: true });
  await Bun.write(join(output, "manual.ts"), "console.log('manual artifact');\\n");
  await Bun.write(
    join(output, "manual-manifest.json"),
    JSON.stringify({
      schema_version: 1,
      mode: "manual",
      execution: { agent_must_not_execute: true, user_executes: true },
      artifacts: [{ kind: "script", runtime: "bun", path: "manual.ts" }]
    }, null, 2)
  );
} else if (command === "apply") {
  await Bun.write(join(output, "adapter-applied"), "ok");
} else if (command === "verify") {
  await Bun.write(join(output, "adapter-verified"), "ok");
}
`,
  );
}

async function demo(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "data-closure-test-"));
  const adapter = join(root, "adapter.ts");
  const unsafeAdapter = join(root, "unsafe-adapter.ts");
  const plan = join(root, "plan.json");
  const bundle = join(root, "bundle");
  try {
    await writeFakeAdapter(adapter);
    const unknownFlag = await runCli(
      "plan",
      "--adapter-runtime",
      "bun",
      "--adapter",
      adapter,
      "--output",
      join(root, "unknown-plan.json"),
      "--unknown",
      "value",
    );
    assert.notEqual(unknownFlag.exitCode, 0);
    assert.match(unknownFlag.stderr, /unknown flag/);

    const duplicateFlag = await runCli(
      "plan",
      "--adapter-runtime",
      "bun",
      "--adapter",
      adapter,
      "--output",
      join(root, "duplicate-plan-a.json"),
      "--output",
      join(root, "duplicate-plan-b.json"),
    );
    assert.notEqual(duplicateFlag.exitCode, 0);
    assert.match(duplicateFlag.stderr, /duplicate flag/);


    const planned = await runCli(
      "plan",
      "--adapter-runtime",
      "bun",
      "--adapter",
      adapter,
      "--output",
      plan,
    );
    assert.equal(planned.exitCode, 0, planned.stderr);

    const exported = await runCli(
      "export",
      "--adapter-runtime",
      "bun",
      "--adapter",
      adapter,
      "--plan",
      plan,
      "--output",
      bundle,
    );
    assert.equal(exported.exitCode, 0, exported.stderr);
    assert.equal(existsSync(join(bundle, "manifest.json")), true);

    const preflighted = await runCli(
      "preflight",
      "--adapter-runtime",
      "bun",
      "--adapter",
      adapter,
      "--bundle",
      bundle,
      "--target",
      "test-target",
      "--target-host",
      "127.0.0.1",
    );
    assert.equal(preflighted.exitCode, 0, preflighted.stderr);
    const mismatchedHostApply = await runCli(
      "apply",
      "--adapter-runtime",
      "bun",
      "--adapter",
      adapter,
      "--bundle",
      bundle,
      "--target",
      "test-target",
      "--target-host",
      "203.0.113.10",
      "--confirm-target",
      "203.0.113.10/test-target",
    );
    assert.notEqual(mismatchedHostApply.exitCode, 0);
    assert.match(mismatchedHostApply.stderr, /target mismatch/);
    assert.equal(existsSync(join(bundle, "adapter-applied")), false);

    const outside = join(root, "outside.json");
    const outsideContent = "{\"secret\":\"outside-bundle\"}\n";
    await writeFile(outside, outsideContent);
    const outsideHash = createHash("sha256").update(outsideContent).digest("hex");

    const symlinkBundle = join(root, "symlink-bundle");
    await mkdir(symlinkBundle);
    await symlink(outside, join(symlinkBundle, "linked.json"));
    await writeFile(
      join(symlinkBundle, "manifest.json"),
      JSON.stringify({
        schema_version: 1,
        run_id: "symlink-run",
        source: "test",
        files: [{ path: "linked.json", kind: "base", rows: 1, sha256: outsideHash }],
      }),
    );
    await assert.rejects(() => validateManifest(symlinkBundle), /escapes bundle/);

    const manualSymlinkOutput = join(root, "manual-symlink");
    await mkdir(manualSymlinkOutput);
    await symlink(outside, join(manualSymlinkOutput, "manual.ts"));
    await writeFile(
      join(manualSymlinkOutput, "manual-manifest.json"),
      JSON.stringify({
        schema_version: 1,
        mode: "manual",
        execution: { agent_must_not_execute: true, user_executes: true },
        artifacts: [{ kind: "script", runtime: "bun", path: "manual.ts" }],
      }),
    );
    await assert.rejects(() => validateManualManifest(manualSymlinkOutput), /escapes output/);

    const invalidNaturalKeysBundle = join(root, "invalid-natural-keys");
    await mkdir(invalidNaturalKeysBundle);
    const invalidNaturalKeysContent = "sample\n";
    await writeFile(join(invalidNaturalKeysBundle, "base.json"), invalidNaturalKeysContent);
    await writeFile(
      join(invalidNaturalKeysBundle, "manifest.json"),
      JSON.stringify({
        schema_version: 1,
        run_id: "invalid-natural-keys",
        source: "test",
        files: [{
          path: "base.json",
          kind: "base",
          rows: 1,
          sha256: createHash("sha256").update(invalidNaturalKeysContent).digest("hex"),
        }],
        natural_keys: [null],
      }),
    );
    await assert.rejects(() => validateManifest(invalidNaturalKeysBundle), /natural_keys/);


    const refusedCleanup = await runCli("cleanup", "--bundle", bundle);
    assert.notEqual(refusedCleanup.exitCode, 0);
    assert.equal(existsSync(bundle), true);

    const manifestPath = join(bundle, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { run_id: string };
    manifest.run_id = "changed-after-preflight";
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    const refusedApply = await runCli(
      "--adapter-runtime",
      "bun",
      "--adapter",
      adapter,
      "--bundle",
      bundle,
      "--target",
      "test-target",
      "--target-host",
      "127.0.0.1",
    );
    assert.notEqual(refusedApply.exitCode, 0);
    assert.equal(existsSync(join(bundle, "adapter-applied")), false);

    const refreshed = await runCli(
      "preflight",
      "--adapter-runtime",
      "bun",
      "--adapter",
      adapter,
      "--bundle",
      bundle,
      "--target",
      "test-target",
      "--target-host",
      "127.0.0.1",
    );
    assert.equal(refreshed.exitCode, 0, refreshed.stderr);

    const applied = await runCli(
      "apply",
      "--adapter-runtime",
      "bun",
      "--adapter",
      adapter,
      "--bundle",
      bundle,
      "--target",
      "test-target",
      "--target-host",
      "127.0.0.1",
    );
    assert.equal(applied.exitCode, 0, applied.stderr);
    assert.equal(existsSync(join(bundle, "adapter-applied")), true);

    const verified = await runCli(
      "verify",
      "--adapter-runtime",
      "bun",
      "--adapter",
      adapter,
      "--bundle",
      bundle,
      "--target",
      "test-target",
      "--target-host",
      "127.0.0.1",
    );
    assert.equal(verified.exitCode, 0, verified.stderr);
    assert.equal(existsSync(join(bundle, "adapter-verified")), true);
    const verifiedState = JSON.parse(await readFile(join(bundle, ".data-closure-verified.json"))) as { target: string };
    assert.equal(verifiedState.target, "127.0.0.1/test-target");

    const cleaned = await runCli("cleanup", "--bundle", bundle);
    assert.equal(cleaned.exitCode, 0, cleaned.stderr);
    assert.equal(existsSync(bundle), false);

    const autoBundle = join(root, "auto-bundle");
    const autoRun = await runCli(
      "run",
      "--mode",
      "auto",
      "--adapter-runtime",
      "bun",
      "--adapter",
      adapter,
      "--output",
      autoBundle,
      "--target",
      "auto-target",
      "--target-host",
      "127.0.0.1",
    );
    assert.equal(autoRun.exitCode, 0, autoRun.stderr);
    assert.equal(existsSync(autoBundle), false);

    const manualOutput = join(root, "manual-output");
    const manualRun = await runCli(
      "prepare",
      "--mode",
      "manual",
      "--adapter-runtime",
      "bun",
      "--adapter",
      adapter,
      "--output",
      manualOutput,
    );
    assert.equal(manualRun.exitCode, 0, manualRun.stderr);
    assert.equal(existsSync(join(manualOutput, "manual-manifest.json")), true);
    assert.equal(existsSync(join(manualOutput, "manual.ts")), true);
    assert.equal(existsSync(join(manualOutput, "adapter-applied")), false);

    const dangerousRun = await runCli(
      "run",
      "--mode",
      "auto",
      "--adapter-runtime",
      "bun",
      "--adapter",
      adapter,
      "--output",
      join(root, "dangerous-bundle"),
      "--target",
      "remote-target",
      "--target-host",
      "203.0.113.10",
    );
    assert.notEqual(dangerousRun.exitCode, 0);
    assert.match(dangerousRun.stderr, /confirm-target/);

    await writeFakeAdapter(unsafeAdapter, "read_write");
    const unsafePlan = await runCli(
      "plan",
      "--adapter-runtime",
      "bun",
      "--adapter",
      unsafeAdapter,
      "--output",
      join(root, "unsafe-plan.json"),
    );
    assert.notEqual(unsafePlan.exitCode, 0);
    assert.match(unsafePlan.stderr, /read.only/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  await demo();
}

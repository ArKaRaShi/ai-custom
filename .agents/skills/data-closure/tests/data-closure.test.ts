import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateManifest } from "../scripts/manifest";
import { validateManualManifest } from "../scripts/safety";

const closureScript = join(import.meta.dir, "../scripts/closure.ts");

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
import { mkdir, writeFile } from "node:fs/promises";
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
    }),
  );
} else if (command === "export") {
  await mkdir(output, { recursive: true });
  const baseContent = "sample-export-data\\n";
  const baseHash = createHash("sha256").update(baseContent).digest("hex");
  await Bun.write(join(output, "base.json"), baseContent);
  await Bun.write(
    join(output, "manifest.json"),
    JSON.stringify({
      schema_version: 1,
      run_id: "test-run",
      source: "test",
      files: [{ path: "base.json", kind: "base", rows: 1, sha256: baseHash }],
    }),
  );
} else if (command === "preflight") {
  // Preflight validation succeeds
} else if (command === "apply") {
  await Bun.write(join(output, "adapter-applied"), "ok");
} else if (command === "verify") {
  await Bun.write(join(output, "adapter-verified"), "ok");
} else if (command === "prepare-manual") {
  await mkdir(output, { recursive: true });
  await Bun.write(
    join(output, "manual-manifest.json"),
    JSON.stringify({
      schema_version: 1,
      mode: "manual",
      execution: { agent_must_not_execute: true, user_executes: true },
      artifacts: [{ kind: "script", runtime: "bun", path: "manual.ts" }],
    }),
  );
  await Bun.write(join(output, "manual.ts"), "console.log('manual');");
}
`,
  );
}

describe("given data-closure CLI", () => {
  let root: string;
  let adapter: string;
  let unsafeAdapter: string;
  let plan: string;
  let bundle: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "data-closure-test-"));
    adapter = join(root, "adapter.ts");
    unsafeAdapter = join(root, "unsafe-adapter.ts");
    plan = join(root, "plan.json");
    bundle = join(root, "bundle");
    await writeFakeAdapter(adapter);
    await writeFakeAdapter(unsafeAdapter, "read_write");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe("when invoking help or invalid flags", () => {
    test("then --help exits 0 with usage instructions", async () => {
      const result = await runCli("--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("data-closure: orchestrator");
      expect(result.stdout).toContain("--format <tree|json>");
      expect(result.stdout).toContain("--apply");
    });

    test("then unknown flags are rejected with an error", async () => {
      const result = await runCli("plan", "--adapter-runtime", "bun", "--adapter", adapter, "--output", plan, "--unknown", "val");
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("unknown flag");
    });

    test("then duplicate flags are rejected with an error", async () => {
      const result = await runCli("plan", "--adapter-runtime", "bun", "--adapter", adapter, "--output", plan, "--output", plan);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("duplicate flag");
    });

    test("then run without --mode fails with clear message", async () => {
      const result = await runCli("run", "--adapter-runtime", "bun");
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("run requires --mode auto or --mode manual");
    });
  });

  describe("when planning data closure", () => {
    test("then generates a valid safety plan with read-only source", async () => {
      const result = await runCli("plan", "--adapter-runtime", "bun", "--adapter", adapter, "--output", plan);
      expect(result.exitCode).toBe(0);
      expect(existsSync(plan)).toBe(true);
      expect(result.stdout).toContain("data-closure:plan [✔ ok]");
    });

    test("then rejects unsafe adapter declaring read_write access", async () => {
      const result = await runCli("plan", "--adapter-runtime", "bun", "--adapter", unsafeAdapter, "--output", plan);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/read.only/);
    });
  });

  describe("when exporting closure bundle", () => {
    test("then produces bundle directory and valid manifest", async () => {
      await runCli("plan", "--adapter-runtime", "bun", "--adapter", adapter, "--output", plan);
      const result = await runCli("export", "--adapter-runtime", "bun", "--adapter", adapter, "--plan", plan, "--output", bundle);
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(bundle, "manifest.json"))).toBe(true);
      expect(result.stdout).toContain("data-closure:export [✔ ok]");
    });

    test("then outputs json when --format=json is passed", async () => {
      await runCli("plan", "--adapter-runtime", "bun", "--adapter", adapter, "--output", plan);
      const result = await runCli("export", "--adapter-runtime", "bun", "--adapter", adapter, "--plan", plan, "--output", bundle, "--format", "json");
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.status).toBe("ok");
      expect(parsed.command).toBe("export");
      expect(parsed.tool).toBe("data-closure");
    });
  });

  describe("when running preflight, apply, and verify lifecycle", () => {
    beforeEach(async () => {
      await runCli("plan", "--adapter-runtime", "bun", "--adapter", adapter, "--output", plan);
      await runCli("export", "--adapter-runtime", "bun", "--adapter", adapter, "--plan", plan, "--output", bundle);
    });

    test("then preflight records verified marker", async () => {
      const result = await runCli(
        "preflight",
        "--adapter-runtime", "bun",
        "--adapter", adapter,
        "--bundle", bundle,
        "--target", "test-target",
        "--target-host", "127.0.0.1",
      );
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(bundle, ".data-closure-preflight.json"))).toBe(true);
    });

    test("then dangerous target requires confirmation", async () => {
      const result = await runCli(
        "apply",
        "--adapter-runtime", "bun",
        "--adapter", adapter,
        "--bundle", bundle,
        "--target", "test-target",
        "--target-host", "203.0.113.10",
      );
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("confirm-target");
    });

    test("then mismatched confirm-target rejects apply", async () => {
      await runCli("preflight", "--adapter-runtime", "bun", "--adapter", adapter, "--bundle", bundle, "--target", "test-target", "--target-host", "203.0.113.10", "--confirm-target", "203.0.113.10/test-target");
      const result = await runCli(
        "apply",
        "--adapter-runtime", "bun",
        "--adapter", adapter,
        "--bundle", bundle,
        "--target", "test-target",
        "--target-host", "203.0.113.10",
        "--confirm-target", "203.0.113.99/test-target",
      );
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/target mismatch|dangerous target/);
    });

    test("then manifest change after preflight refuses stale apply", async () => {
      await runCli("preflight", "--adapter-runtime", "bun", "--adapter", adapter, "--bundle", bundle, "--target", "test-target", "--target-host", "127.0.0.1");

      // Mutate manifest after preflight
      const manifestPath = join(bundle, "manifest.json");
      const manifestData = JSON.parse(await readFile(manifestPath, "utf8")) as { run_id: string };
      manifestData.run_id = "changed-after-preflight";
      await writeFile(manifestPath, JSON.stringify(manifestData, null, 2));

      // Fixed: previously missed "apply" command
      const result = await runCli(
        "apply",
        "--adapter-runtime", "bun",
        "--adapter", adapter,
        "--bundle", bundle,
        "--target", "test-target",
        "--target-host", "127.0.0.1",
      );
      expect(result.exitCode).not.toBe(0);
      expect(existsSync(join(bundle, "adapter-applied"))).toBe(false);
    });

    test("then full lifecycle through verify succeeds", async () => {
      await runCli("preflight", "--adapter-runtime", "bun", "--adapter", adapter, "--bundle", bundle, "--target", "test-target", "--target-host", "127.0.0.1");
      const applyResult = await runCli("apply", "--adapter-runtime", "bun", "--adapter", adapter, "--bundle", bundle, "--target", "test-target", "--target-host", "127.0.0.1");
      expect(applyResult.exitCode).toBe(0);
      expect(existsSync(join(bundle, "adapter-applied"))).toBe(true);

      const verifyResult = await runCli("verify", "--adapter-runtime", "bun", "--adapter", adapter, "--bundle", bundle, "--target", "test-target", "--target-host", "127.0.0.1");
      expect(verifyResult.exitCode).toBe(0);
      expect(existsSync(join(bundle, "adapter-verified"))).toBe(true);
      expect(existsSync(join(bundle, ".data-closure-verified.json"))).toBe(true);
    });
  });

  describe("when executing cleanup", () => {
    beforeEach(async () => {
      await runCli("plan", "--adapter-runtime", "bun", "--adapter", adapter, "--output", plan);
      await runCli("export", "--adapter-runtime", "bun", "--adapter", adapter, "--plan", plan, "--output", bundle);
    });

    test("then cleanup fails if bundle is not yet verified", async () => {
      const result = await runCli("cleanup", "--bundle", bundle, "--apply");
      expect(result.exitCode).not.toBe(0);
      expect(existsSync(bundle)).toBe(true);
    });

    test("then cleanup without --apply previews deletion and preserves bundle", async () => {
      await runCli("preflight", "--adapter-runtime", "bun", "--adapter", adapter, "--bundle", bundle, "--target", "test-target", "--target-host", "127.0.0.1");
      await runCli("apply", "--adapter-runtime", "bun", "--adapter", adapter, "--bundle", bundle, "--target", "test-target", "--target-host", "127.0.0.1");
      await runCli("verify", "--adapter-runtime", "bun", "--adapter", adapter, "--bundle", bundle, "--target", "test-target", "--target-host", "127.0.0.1");

      const preview = await runCli("cleanup", "--bundle", bundle);
      expect(preview.exitCode).toBe(0);
      expect(preview.stdout).toContain("preview");
      expect(existsSync(bundle)).toBe(true);
    });

    test("then cleanup with --apply deletes verified bundle", async () => {
      await runCli("preflight", "--adapter-runtime", "bun", "--adapter", adapter, "--bundle", bundle, "--target", "test-target", "--target-host", "127.0.0.1");
      await runCli("apply", "--adapter-runtime", "bun", "--adapter", adapter, "--bundle", bundle, "--target", "test-target", "--target-host", "127.0.0.1");
      await runCli("verify", "--adapter-runtime", "bun", "--adapter", adapter, "--bundle", bundle, "--target", "test-target", "--target-host", "127.0.0.1");

      const cleaned = await runCli("cleanup", "--bundle", bundle, "--apply");
      expect(cleaned.exitCode).toBe(0);
      expect(existsSync(bundle)).toBe(false);
    });
  });

  describe("when running end-to-end modes", () => {
    test("then auto mode executes full cycle and cleans up", async () => {
      const autoBundle = join(root, "auto-bundle");
      const autoRun = await runCli(
        "run",
        "--mode", "auto",
        "--adapter-runtime", "bun",
        "--adapter", adapter,
        "--output", autoBundle,
        "--target", "auto-target",
        "--target-host", "127.0.0.1",
      );
      expect(autoRun.exitCode).toBe(0);
      expect(existsSync(autoBundle)).toBe(false);
    });

    test("then manual mode prepares artifacts without applying", async () => {
      const manualOutput = join(root, "manual-output");
      const manualRun = await runCli(
        "prepare",
        "--mode", "manual",
        "--adapter-runtime", "bun",
        "--adapter", adapter,
        "--output", manualOutput,
      );
      expect(manualRun.exitCode).toBe(0);
      expect(existsSync(join(manualOutput, "manual-manifest.json"))).toBe(true);
      expect(existsSync(join(manualOutput, "manual.ts"))).toBe(true);
      expect(existsSync(join(manualOutput, "adapter-applied"))).toBe(false);
    });
  });

  describe("when validating security boundaries", () => {
    test("then manifest rejects escaping symlinks", async () => {
      const outside = join(root, "outside.json");
      await writeFile(outside, "{\"secret\":\"outside-bundle\"}\n");
      const outsideHash = createHash("sha256").update("{\"secret\":\"outside-bundle\"}\n").digest("hex");

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
      await expect(validateManifest(symlinkBundle)).rejects.toThrow(/escapes bundle/);
    });

    test("then manual manifest rejects escaping symlinks", async () => {
      const outside = join(root, "outside.json");
      await writeFile(outside, "{\"secret\":\"outside-bundle\"}\n");

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
      await expect(validateManualManifest(manualSymlinkOutput)).rejects.toThrow(/escapes output/);
    });
  });
});

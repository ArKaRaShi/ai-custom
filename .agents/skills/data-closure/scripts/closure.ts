#!/usr/bin/env bun
import { existsSync, lstatSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { validateManifest } from "./manifest";
import { assertLifecycleState, writeLifecycleState } from "./verify";
import { assertTargetSafety, targetFingerprint, validateManualManifest, validateSafetyPlan } from "./safety";

const PREFLIGHT_MARKER = ".data-closure-preflight.json";
const VERIFIED_MARKER = ".data-closure-verified.json";

type FlagName =
  | "mode"
  | "adapter-runtime"
  | "adapter"
  | "output"
  | "target"
  | "target-host"
  | "confirm-target"
  | "plan"
  | "bundle"
  | "format"
  | "apply";

type Flags = Partial<Record<FlagName, string>>;

const KNOWN_FLAGS: Record<FlagName, true> = {
  mode: true,
  "adapter-runtime": true,
  adapter: true,
  output: true,
  target: true,
  "target-host": true,
  "confirm-target": true,
  plan: true,
  bundle: true,
  format: true,
  apply: true,
};

function printUsage(): void {
  console.log(`data-closure: orchestrator for scoped database transfers with foreign-key closure

Usage:
  closure.ts plan --adapter-runtime <rt> --adapter <ad> --output <plan.json> [--target <db>]
  closure.ts export --adapter-runtime <rt> --adapter <ad> --plan <plan.json> --output <bundle>
  closure.ts preflight --adapter-runtime <rt> --adapter <ad> --bundle <bundle> --target <db> --target-host <host> [--confirm-target <target>]
  closure.ts apply --adapter-runtime <rt> --adapter <ad> --bundle <bundle> --target <db> --target-host <host> [--confirm-target <target>]
  closure.ts verify --adapter-runtime <rt> --adapter <ad> --bundle <bundle> --target <db> --target-host <host> [--confirm-target <target>]
  closure.ts cleanup --bundle <bundle> [--apply]
  closure.ts prepare --mode manual --adapter-runtime <rt> --adapter <ad> --output <dir> [--target <db>] [--target-host <host>]
  closure.ts run --mode <auto|manual> ...

Options:
  --format <tree|json>   Output format (default: tree)
  --apply                Commit destructive mutations (e.g. bundle deletion during cleanup)
  -h, --help             Show this help message and exit 0
`);
}

function parseArgs(argv: string[]): { command: string; flags: Flags } {
  const command = argv[0];
  if (command === undefined || command === "--help" || command === "-h" || command === "help") {
    printUsage();
    process.exit(0);
  }

  const flags: Flags = {};
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      printUsage();
      process.exit(0);
    }
    if (!argument.startsWith("--")) {
      throw new Error(`unexpected argument: ${argument}`);
    }
    const name = argument.slice(2) as FlagName;
    if (KNOWN_FLAGS[name] !== true) {
      throw new Error(`unknown flag: ${argument}`);
    }
    if (flags[name] !== undefined) {
      throw new Error(`duplicate flag: ${argument}`);
    }

    if (name === "apply") {
      flags[name] = "true";
      continue;
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`flag requires a value: ${argument}`);
    }
    flags[name] = value;
    index += 1;
  }
  return { command, flags };
}

function getFormat(flags: Flags): "tree" | "json" {
  const fmt = flags.format ?? "tree";
  if (fmt !== "tree" && fmt !== "json") {
    throw new Error(`invalid --format: ${fmt} (expected tree or json)`);
  }
  return fmt;
}

interface LogPayload {
  status: "ok" | "error" | "preview";
  command: string;
  tool: "data-closure";
  fingerprint: Record<string, unknown>;
  details?: Record<string, unknown>;
  message?: string;
}

function emitResult(format: "tree" | "json", payload: LogPayload): void {
  if (format === "json") {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  const statusIcon = payload.status === "ok" ? "✔ ok" : payload.status === "preview" ? "ℹ preview" : "✖ error";
  console.log(`data-closure:${payload.command} [${statusIcon}]`);
  const entries = Object.entries({
    ...payload.fingerprint,
    ...(payload.details ?? {}),
  });
  entries.forEach(([key, val], idx) => {
    const isLast = idx === entries.length - 1 && !payload.message;
    const prefix = isLast ? "  └─ " : "  ├─ ";
    console.log(`${prefix}${key.padEnd(16)} ${typeof val === "object" ? JSON.stringify(val) : String(val)}`);
  });
  if (payload.message) {
    console.log(`  └─ status           ${payload.message}`);
  }
}

function required(flags: Flags, name: FlagName): string {
  const value = flags[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`missing required flag: --${name}`);
  }
  return value;
}

function assertBundleDirectory(bundle: string): string {
  const path = resolve(bundle);
  if (!existsSync(path)) {
    throw new Error(`bundle does not exist: ${path}`);
  }
  if (!lstatSync(path).isDirectory()) {
    throw new Error(`bundle is not a directory: ${path}`);
  }
  if (basename(path) === "" || path === dirname(path)) {
    throw new Error(`refusing unsafe bundle path: ${path}`);
  }
  return path;
}

async function runAdapter(
  runtime: string,
  adapter: string,
  command: string,
  flags: Record<string, string> = {},
): Promise<void> {
  const argumentsList = [runtime, adapter, command];
  for (const [name, value] of Object.entries(flags)) {
    argumentsList.push(`--${name}`, value);
  }
  const child = Bun.spawn(argumentsList, { stdout: "inherit", stderr: "inherit" });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`adapter ${command} failed with exit code ${exitCode}`);
  }
}

async function commandPlan(flags: Flags): Promise<void> {
  const format = getFormat(flags);
  const runtime = required(flags, "adapter-runtime");
  const adapter = required(flags, "adapter");
  const output = resolve(required(flags, "output"));
  if (existsSync(output)) {
    throw new Error(`refusing to overwrite existing safety plan: ${output}`);
  }
  await mkdir(dirname(output), { recursive: true });
  const adapterFlags = flags.target === undefined ? { output } : { output, target: flags.target };
  await runAdapter(runtime, adapter, "plan", adapterFlags);
  const plan = await validateSafetyPlan(output);
  emitResult(format, {
    status: "ok",
    command: "plan",
    tool: "data-closure",
    fingerprint: { adapter, runtime, output },
    details: { source_access: plan.source.access, host_class: plan.source.host_class },
    message: "safety plan created",
  });
}

async function commandExport(flags: Flags): Promise<void> {
  const format = getFormat(flags);
  const runtime = required(flags, "adapter-runtime");
  const adapter = required(flags, "adapter");
  const plan = resolve(required(flags, "plan"));
  await validateSafetyPlan(plan);
  const output = resolve(required(flags, "output"));
  if (existsSync(output)) {
    throw new Error(`refusing to overwrite existing bundle: ${output}`);
  }
  await mkdir(output, { recursive: true });
  try {
    await runAdapter(runtime, adapter, "export", { output, plan });
    const manifest = await validateManifest(output);
    emitResult(format, {
      status: "ok",
      command: "export",
      tool: "data-closure",
      fingerprint: { adapter, runtime, plan, bundle: output },
      details: { run_id: manifest.manifest.run_id, files_count: manifest.manifest.files.length },
      message: "data closure bundle exported",
    });
  } catch (error) {
    console.error(`bundle preserved for diagnosis: ${output}`);
    throw error;
  }
}

async function commandPreflight(flags: Flags): Promise<void> {
  const format = getFormat(flags);
  const runtime = required(flags, "adapter-runtime");
  const adapter = required(flags, "adapter");
  const bundle = assertBundleDirectory(required(flags, "bundle"));
  const target = required(flags, "target");
  const targetHost = required(flags, "target-host");
  assertTargetSafety({ host: targetHost, database: target }, flags["confirm-target"]);
  const validated = await validateManifest(bundle);
  await runAdapter(runtime, adapter, "preflight", { bundle, target, "target-host": targetHost });
  await rm(resolve(bundle, VERIFIED_MARKER), { force: true });
  await writeLifecycleState(bundle, PREFLIGHT_MARKER, validated.digest, targetFingerprint({ host: targetHost, database: target }));
  emitResult(format, {
    status: "ok",
    command: "preflight",
    tool: "data-closure",
    fingerprint: { bundle, target: targetFingerprint({ host: targetHost, database: target }) },
    details: { digest: validated.digest.slice(0, 16) },
    message: "preflight verification passed",
  });
}

async function commandApply(flags: Flags): Promise<void> {
  const format = getFormat(flags);
  const runtime = required(flags, "adapter-runtime");
  const adapter = required(flags, "adapter");
  const bundle = assertBundleDirectory(required(flags, "bundle"));
  const target = required(flags, "target");
  const targetHost = required(flags, "target-host");
  assertTargetSafety({ host: targetHost, database: target }, flags["confirm-target"]);
  const validated = await validateManifest(bundle);
  await assertLifecycleState(bundle, PREFLIGHT_MARKER, validated.digest, targetFingerprint({ host: targetHost, database: target }));
  await runAdapter(runtime, adapter, "apply", { bundle, target, "target-host": targetHost });
  emitResult(format, {
    status: "ok",
    command: "apply",
    tool: "data-closure",
    fingerprint: { bundle, target: targetFingerprint({ host: targetHost, database: target }) },
    message: "closure bundle applied to target",
  });
}

async function commandVerify(flags: Flags): Promise<void> {
  const format = getFormat(flags);
  const runtime = required(flags, "adapter-runtime");
  const adapter = required(flags, "adapter");
  const bundle = assertBundleDirectory(required(flags, "bundle"));
  const target = required(flags, "target");
  const targetHost = required(flags, "target-host");
  assertTargetSafety({ host: targetHost, database: target }, flags["confirm-target"]);
  const validated = await validateManifest(bundle);
  await assertLifecycleState(bundle, PREFLIGHT_MARKER, validated.digest, targetFingerprint({ host: targetHost, database: target }));
  await runAdapter(runtime, adapter, "verify", { bundle, target, "target-host": targetHost });
  await writeLifecycleState(bundle, VERIFIED_MARKER, validated.digest, targetFingerprint({ host: targetHost, database: target }));
  emitResult(format, {
    status: "ok",
    command: "verify",
    tool: "data-closure",
    fingerprint: { bundle, target: targetFingerprint({ host: targetHost, database: target }) },
    details: { verified: true },
    message: "post-import verification succeeded",
  });
}

async function commandCleanup(flags: Flags): Promise<void> {
  const format = getFormat(flags);
  const bundle = assertBundleDirectory(required(flags, "bundle"));
  const verified = await validateManifest(bundle);
  await assertLifecycleState(bundle, VERIFIED_MARKER, verified.digest);

  if (flags.apply !== "true") {
    emitResult(format, {
      status: "preview",
      command: "cleanup",
      tool: "data-closure",
      fingerprint: { bundle },
      details: {
        action: "preview_only",
        verified: true,
        hint: "pass --apply to delete the verified bundle directory",
      },
      message: "bundle verified and ready for deletion; rerun with --apply to remove",
    });
    return;
  }

  await rm(bundle, { recursive: true, force: false });
  emitResult(format, {
    status: "ok",
    command: "cleanup",
    tool: "data-closure",
    fingerprint: { bundle },
    details: { action: "deleted" },
    message: `cleaned bundle ${bundle}`,
  });
}

async function commandPrepareManual(flags: Flags): Promise<void> {
  const format = getFormat(flags);
  if (required(flags, "mode") !== "manual") {
    throw new Error("prepare requires --mode manual");
  }
  if (flags.target !== undefined || flags["target-host"] !== undefined) {
    const target = required(flags, "target");
    const targetHost = required(flags, "target-host");
    assertTargetSafety({ host: targetHost, database: target }, flags["confirm-target"]);
  }
  const runtime = required(flags, "adapter-runtime");
  const adapter = required(flags, "adapter");
  const output = resolve(required(flags, "output"));
  if (existsSync(output)) {
    throw new Error(`refusing to overwrite existing manual artifacts: ${output}`);
  }
  await mkdir(output, { recursive: true });
  const adapterFlags = flags.target === undefined ? { output } : {
    output,
    target: flags.target,
    ...(flags["target-host"] === undefined ? {} : { "target-host": flags["target-host"] }),
  };
  await runAdapter(runtime, adapter, "prepare-manual", adapterFlags);
  await validateManualManifest(output);
  emitResult(format, {
    status: "ok",
    command: "prepare",
    tool: "data-closure",
    fingerprint: { adapter, runtime, output },
    details: { manual_mode: true },
    message: "manual artifacts ready for user review",
  });
}

async function commandRunAuto(flags: Flags): Promise<void> {
  if (flags.mode !== "auto") {
    throw new Error("run requires --mode auto or --mode manual");
  }
  const target = required(flags, "target");
  const targetHost = required(flags, "target-host");
  assertTargetSafety({ host: targetHost, database: target }, flags["confirm-target"]);
  const output = resolve(required(flags, "output"));
  const plan = `${output}.plan.json`;
  await commandPlan({ ...flags, output: plan, target });
  try {
    await commandExport({ ...flags, plan, output });
    await commandPreflight({ ...flags, bundle: output, target, "target-host": targetHost });
    await commandApply({ ...flags, bundle: output, target, "target-host": targetHost });
    await commandVerify({ ...flags, bundle: output, target, "target-host": targetHost });
    await commandCleanup({ ...flags, bundle: output, apply: "true" });
    await rm(plan, { force: true });
  } catch (error) {
    console.error(`plan and bundle preserved for diagnosis: ${plan}, ${output}`);
    throw error;
  }
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(Bun.argv.slice(2));
  if (command === "plan") {
    await commandPlan(flags);
  } else if (command === "export") {
    await commandExport(flags);
  } else if (command === "preflight") {
    await commandPreflight(flags);
  } else if (command === "apply") {
    await commandApply(flags);
  } else if (command === "verify") {
    await commandVerify(flags);
  } else if (command === "cleanup") {
    await commandCleanup(flags);
  } else if (command === "prepare") {
    await commandPrepareManual(flags);
  } else if (command === "run") {
    if (flags.mode === "manual") {
      await commandPrepareManual(flags);
    } else if (flags.mode === "auto") {
      await commandRunAuto(flags);
    } else {
      throw new Error("run requires --mode auto or --mode manual");
    }
  } else {
    throw new Error(`unknown command or mode: ${command}`);
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

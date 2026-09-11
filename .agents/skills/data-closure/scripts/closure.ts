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
  | "bundle";
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
};

function parseArgs(argv: string[]): { command: string; flags: Flags } {
  const command = argv[0];
  if (command === undefined || command === "--help" || command === "-h") {
    throw new Error("usage: closure.ts <plan|export|preflight|apply|verify|cleanup|run|prepare> [--key value ...]");
  }
  const flags: Flags = {};
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
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
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`flag requires a value: ${argument}`);
    }
    flags[name] = value;
    index += 1;
  }
  return { command, flags };
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
  const output = resolve(required(flags, "output"));
  if (existsSync(output)) {
    throw new Error(`refusing to overwrite existing safety plan: ${output}`);
  }
  await mkdir(dirname(output), { recursive: true });
  const adapterFlags = flags.target === undefined ? { output } : { output, target: flags.target };
  await runAdapter(required(flags, "adapter-runtime"), required(flags, "adapter"), "plan", adapterFlags);
  await validateSafetyPlan(output);
  console.log(`plan-passed: ${output}`);
}

async function commandExport(flags: Flags): Promise<void> {
  const plan = resolve(required(flags, "plan"));
  await validateSafetyPlan(plan);
  const output = resolve(required(flags, "output"));
  if (existsSync(output)) {
    throw new Error(`refusing to overwrite existing bundle: ${output}`);
  }
  await mkdir(output, { recursive: true });
  try {
    await runAdapter(required(flags, "adapter-runtime"), required(flags, "adapter"), "export", { output, plan });
    await validateManifest(output);
    console.log(`exported: ${output}`);
  } catch (error) {
    console.error(`bundle preserved for diagnosis: ${output}`);
    throw error;
  }
}

async function commandPreflight(flags: Flags): Promise<void> {
  const bundle = assertBundleDirectory(required(flags, "bundle"));
  const target = required(flags, "target");
  const targetHost = required(flags, "target-host");
  assertTargetSafety({ host: targetHost, database: target }, flags["confirm-target"]);
  const validated = await validateManifest(bundle);
  await runAdapter(required(flags, "adapter-runtime"), required(flags, "adapter"), "preflight", { bundle, target, "target-host": targetHost });
  await rm(resolve(bundle, VERIFIED_MARKER), { force: true });
  await writeLifecycleState(bundle, PREFLIGHT_MARKER, validated.digest, targetFingerprint({ host: targetHost, database: target }));
  console.log(`preflight-passed: ${bundle}`);
}

async function commandApply(flags: Flags): Promise<void> {
  const bundle = assertBundleDirectory(required(flags, "bundle"));
  const target = required(flags, "target");
  const targetHost = required(flags, "target-host");
  assertTargetSafety({ host: targetHost, database: target }, flags["confirm-target"]);
  const validated = await validateManifest(bundle);
  await assertLifecycleState(bundle, PREFLIGHT_MARKER, validated.digest, targetFingerprint({ host: targetHost, database: target }));
  await runAdapter(required(flags, "adapter-runtime"), required(flags, "adapter"), "apply", { bundle, target, "target-host": targetHost });
  console.log(`applied: ${target}`);
}

async function commandVerify(flags: Flags): Promise<void> {
  const bundle = assertBundleDirectory(required(flags, "bundle"));
  const target = required(flags, "target");
  const targetHost = required(flags, "target-host");
  assertTargetSafety({ host: targetHost, database: target }, flags["confirm-target"]);
  const validated = await validateManifest(bundle);
  await assertLifecycleState(bundle, PREFLIGHT_MARKER, validated.digest, targetFingerprint({ host: targetHost, database: target }));
  await runAdapter(required(flags, "adapter-runtime"), required(flags, "adapter"), "verify", { bundle, target, "target-host": targetHost });
  await writeLifecycleState(bundle, VERIFIED_MARKER, validated.digest, targetFingerprint({ host: targetHost, database: target }));
  console.log(`verified: ${target}`);
}

async function commandCleanup(flags: Flags): Promise<void> {
  const bundle = assertBundleDirectory(required(flags, "bundle"));
  const verified = await validateManifest(bundle);
  await assertLifecycleState(bundle, VERIFIED_MARKER, verified.digest);
  await rm(bundle, { recursive: true, force: false });
  console.log(`cleaned: ${bundle}`);
}

async function commandPrepareManual(flags: Flags): Promise<void> {
  if (required(flags, "mode") !== "manual") {
    throw new Error("prepare requires --mode manual");
  }
  if (flags.target !== undefined || flags["target-host"] !== undefined) {
    const target = required(flags, "target");
    const targetHost = required(flags, "target-host");
    assertTargetSafety({ host: targetHost, database: target }, flags["confirm-target"]);
  }
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
  await runAdapter(required(flags, "adapter-runtime"), required(flags, "adapter"), "prepare-manual", adapterFlags);
  await validateManualManifest(output);
  console.log(`manual-artifacts-ready: ${output}`);
}

async function commandRunAuto(flags: Flags): Promise<void> {
  if (required(flags, "mode") !== "auto") {
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
    await commandCleanup({ bundle: output });
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
  } else if (command === "run" && flags.mode === "manual") {
    await commandPrepareManual(flags);
  } else if (command === "run" && flags.mode === "auto") {
    await commandRunAuto(flags);
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

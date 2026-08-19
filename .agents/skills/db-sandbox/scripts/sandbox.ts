#!/usr/bin/env bun
/**
 * Isolated sandbox database per identifier, across postgres/mysql/sqlite.
 *
 *   bun scripts/sandbox.ts postgres create feature-x --base app_dev
 *   bun scripts/sandbox.ts postgres drop feature-x --base app_dev --confirm DROP
 *   bun scripts/sandbox.ts postgres list        # this engine only
 *   bun scripts/sandbox.ts list                 # every engine, whole machine
 *
 * Connection config resolves per field as:
 *   --flag > --env-file entry > ambient process.env > built-in default
 * so a project agent can point --env-file at that project's own .env(.local)
 * (DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME) instead of restating
 * connection info as flags. See SKILL.md for the full pattern and guardrails.
 *
 * Registry defaults to a fixed per-user, per-machine root (defaultRegistryRoot
 * in base.ts), not the invoking cwd - two repos on the same machine share one
 * inventory, so `list` never misses a sandbox another repo created and
 * `create`/`drop` see the same registered entry regardless of which repo
 * runs them. `drop` refuses to remove a sandbox registered from a different
 * project directory unless `--force true` is passed.
 */

import { existsSync, unlinkSync } from "node:fs";
import {
  assertDroppable,
  assertLocalTarget,
  type Conn,
  defaultRegistryRoot,
  deriveTarget,
  listRegistry,
  loadEnvFile,
  normalizeIdentifier,
  readRegistry,
  registryPath,
  resolveField,
  writeRegistry,
} from "./base";
import { type EngineName, REGISTRY } from "./engines";

type Flags = Record<string, string>;

function parseArgs(argv: string[]): { positional: string[]; flags: Flags } {
  const positional: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      flags[arg.slice(2)] = argv[++i];
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

/** Resolve connection + base db name/path from --flags, --env-file, then ambient env. */
function resolveConfig(engineName: EngineName, flags: Flags): { conn: Conn; base: string | undefined } {
  const envFileValues = flags["env-file"] ? loadEnvFile(flags["env-file"]) : {};
  const conn: Conn = {
    host: resolveField(flags.host, envFileValues, "DB_HOST", "localhost"),
    port: Number(resolveField(flags.port, envFileValues, "DB_PORT")) || undefined,
    user: resolveField(flags.user, envFileValues, "DB_USER"),
    password: resolveField(flags.password, envFileValues, "DB_PASSWORD"),
  };
  const baseEnvKey = engineName === "sqlite" ? "DB_PATH" : "DB_NAME";
  const base = resolveField(flags.base, envFileValues, baseEnvKey);
  return { conn, base };
}

async function cmdCreate(engineName: EngineName, identifier: string, flags: Flags): Promise<void> {
  const engine = REGISTRY[engineName];
  const { conn, base } = resolveConfig(engineName, flags);
  if (!base) {
    throw new Error("--base is required (or set DB_NAME/DB_PATH via --env-file / ambient env)");
  }
  const normId = normalizeIdentifier(identifier);
  const registryDir = flags.registry ?? defaultRegistryRoot();
  const tier = flags.tier ?? "full";
  const project = process.cwd();

  if (engineName !== "sqlite") {
    assertLocalTarget(conn.host ?? "localhost");
  }

  // Self-heal: a registered entry whose target no longer exists in the
  // database (dropped by hand, or a create that died mid-clone) must not
  // permanently squat the identifier - prune it instead of refusing forever.
  const existing = readRegistry(registryDir, engineName, conn, base, normId);
  if (existing) {
    if (await engine.exists(conn, existing.SANDBOX_DB)) {
      throw new Error(
        `sandbox for '${identifier}' already registered (created from ${existing.PROJECT ?? "unknown project"}) ` +
          "(drop it first, or check `list` to reuse the existing one)",
      );
    }
    unlinkSync(registryPath(registryDir, engineName, conn, base, normId));
    console.log(`pruned stale registry entry for '${identifier}' (target no longer exists)`);
  }

  const target = deriveTarget(engineName, base, normId);
  if (await engine.exists(conn, target)) {
    throw new Error(`target already exists in the database itself: '${target}'`);
  }

  await engine.create(conn, target);
  try {
    if (tier === "full") await engine.clone(conn, base, target);
    writeRegistry(registryDir, engineName, conn, base, normId, target, project);
  } catch (err) {
    await engine.drop(conn, target);
    throw err;
  }

  console.log(`created: ${target} (tier=${tier})`);
}

async function cmdDrop(engineName: EngineName, identifier: string, flags: Flags): Promise<void> {
  if (flags.confirm !== "DROP") {
    throw new Error("drop is destructive. Re-run with --confirm DROP");
  }

  const engine = REGISTRY[engineName];
  const { conn, base } = resolveConfig(engineName, flags);
  if (!base) {
    throw new Error("--base is required (or set DB_NAME/DB_PATH via --env-file / ambient env)");
  }
  const normId = normalizeIdentifier(identifier);
  const registryDir = flags.registry ?? defaultRegistryRoot();

  if (engineName !== "sqlite") {
    assertLocalTarget(conn.host ?? "localhost");
  }

  const entry = readRegistry(registryDir, engineName, conn, base, normId);
  const target = entry?.SANDBOX_DB ?? deriveTarget(engineName, base, normId);
  assertDroppable(base, target);

  // The registry is shared across every repo on the machine, so a shared
  // sandbox is also shared destructive access - refuse to drop another
  // project's sandbox unless explicitly forced.
  if (entry?.PROJECT && entry.PROJECT !== process.cwd() && flags.force !== "true") {
    throw new Error(
      `sandbox '${identifier}' was created from ${entry.PROJECT}, not this repo (${process.cwd()}). ` +
        "Re-run with --force true if you're intentionally dropping another project's sandbox.",
    );
  }

  const path = registryPath(registryDir, engineName, conn, base, normId);
  if (!(await engine.exists(conn, target))) {
    if (entry) {
      // Already gone from the database (dropped outside the tool) - prune
      // the stale entry instead of refusing forever.
      if (existsSync(path)) unlinkSync(path);
      console.log(`pruned stale entry: ${target} (already gone from the database)`);
      return;
    }
    throw new Error(`nothing to drop, does not exist: '${target}'`);
  }
  await engine.drop(conn, target);

  if (existsSync(path)) unlinkSync(path);
  console.log(`dropped: ${target}`);
}

function cmdList(flags: Flags): void {
  const registryDir = flags.registry ?? defaultRegistryRoot();
  const entries = listRegistry(registryDir, { engine: flags.engine, base: flags.base });
  if (entries.length === 0) {
    console.log("(no sandboxes registered)");
    return;
  }
  for (const [identifier, values] of entries) {
    console.log(
      `${identifier}: ${values.ENGINE ?? "?"} -> ${values.SANDBOX_DB ?? "?"} ` +
        `(base=${values.BASE ?? "?"}, project=${values.PROJECT ?? "?"})`,
    );
  }
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs(process.argv.slice(2));

  // `list` is the only command that works without picking an engine first -
  // it's the whole-machine view across every engine, sharing one registry.
  if (positional[0] === "list") {
    cmdList(flags);
    return;
  }

  const [engineArg, command, identifier] = positional;
  if (!engineArg || !(engineArg in REGISTRY)) {
    throw new Error(`engine must be one of: ${Object.keys(REGISTRY).join(", ")}`);
  }
  const engineName = engineArg as EngineName;

  if (command === "create") {
    if (!identifier) throw new Error("create requires an identifier");
    await cmdCreate(engineName, identifier, flags);
  } else if (command === "drop") {
    if (!identifier) throw new Error("drop requires an identifier");
    await cmdDrop(engineName, identifier, flags);
  } else if (command === "list") {
    cmdList({ ...flags, engine: engineName });
  } else {
    throw new Error(`unknown command '${command}'. Expected create|drop|list`);
  }
}

/**
 * Bun's ShellError.message is always the generic "Failed with exit code N";
 * the actually useful text (command not found, connection refused, auth
 * failure, ...) is on .stderr. Prefer that when present.
 */
function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "stderr" in err) {
    const stderr = String(err.stderr ?? "").trim();
    if (stderr) return stderr;
  }
  return err instanceof Error ? err.message : String(err);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(errorMessage(err));
    process.exit(1);
  });
}

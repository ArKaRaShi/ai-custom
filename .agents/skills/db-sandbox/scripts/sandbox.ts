#!/usr/bin/env bun
/**
 * Isolated sandbox database per identifier across postgres/mysql/sqlite.
 * Supports auto-detection of engine, git branch identifier, and safe-by-default preview.
 */

import { existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type Conn,
  type EngineName,
  assertDroppable,
  assertLocalTarget,
  defaultRegistryRoot,
  deriveTarget,
  listRegistry,
  loadEnvFile,
  normalizeIdentifier,
  parseDbUrl,
  readRegistry,
  registryPath,
  resolveField,
  writeRegistry,
} from "./base";
import { type CloneMode, REGISTRY } from "./engines";
import * as postgres from "./engines/postgres";

type Flags = Record<string, string>;

export function createsTargetBeforeClone(
  engineName: EngineName,
  tier: string,
  postgresCloneMode: CloneMode = "template",
): boolean {
  return tier !== "full" || engineName !== "postgres" || postgresCloneMode === "logical";
}

function parseArgs(argv: string[]): { positional: string[]; flags: Flags } {
  const positional: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h") {
      flags.h = "true";
    } else if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          flags[arg.slice(2)] = next;
          i++;
        } else {
          flags[arg.slice(2)] = "true";
        }
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function printHelp(): void {
  console.log(`Usage:
  sandbox.ts list [--engine <engine>] [--format=json]
  sandbox.ts prune [--apply] [--format=json]
  sandbox.ts [engine] create [identifier] --base <base-db-or-path> [--tier bare|full]
  sandbox.ts [engine] drop <identifier> --base <base-db-or-path> --confirm DROP [--force true]

Auto-detection:
  - If engine is omitted, it auto-detects from --base or .env (e.g. .db -> sqlite).
  - If identifier is omitted on create, it defaults to the current git branch name.
  - prune defaults to safe preview; pass --apply to execute deletions.

Connection options: --env-file <path>, --host <host>, --port <port>, --user <user>, --password <password>
Other options: --registry <path>, --format json|text`);
}

function autoDetectCurrentBranch(): string | undefined {
  const proc = Bun.spawnSync(["git", "branch", "--show-current"], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode === 0) {
    const branch = proc.stdout.toString().trim();
    if (branch.length > 0) return branch;
  }
  return undefined;
}

function autoDetectEngine(base?: string, dbUrl?: string): EngineName {
  if (base && (base.endsWith(".db") || base.endsWith(".sqlite") || base.endsWith(".sqlite3"))) {
    return "sqlite";
  }
  if (dbUrl) {
    if (dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://")) return "postgres";
    if (dbUrl.startsWith("mysql://")) return "mysql";
    if (dbUrl.startsWith("sqlite://") || dbUrl.includes(".db")) return "sqlite";
  }
  return "sqlite";
}

function resolveConfig(engineName: EngineName, flags: Flags): { conn: Conn; base: string | undefined } {
  const envFileValues = flags["env-file"] ? loadEnvFile(flags["env-file"]) : {};
  const dbUrl =
    envFileValues.DATABASE_URL ??
    envFileValues.DATABASE_URI ??
    process.env.DATABASE_URL ??
    process.env.DATABASE_URI;
  const parsedUrl = parseDbUrl(dbUrl);

  const conn: Conn = {
    host: resolveField(flags.host, envFileValues, "DB_HOST", parsedUrl.host ?? "localhost"),
    port: Number(resolveField(flags.port, envFileValues, "DB_PORT", parsedUrl.port ? String(parsedUrl.port) : undefined)) || undefined,
    user: resolveField(flags.user, envFileValues, "DB_USER", parsedUrl.user),
    password: resolveField(flags.password, envFileValues, "DB_PASSWORD", parsedUrl.password),
  };
  const baseEnvKey = engineName === "sqlite" ? "DB_PATH" : "DB_NAME";
  const base = resolveField(flags.base, envFileValues, baseEnvKey, parsedUrl.base);
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

  const postgresCloneMode =
    engineName === "postgres" && tier === "full"
      ? await postgres.resolveCloneMode(conn, base)
      : "template";

  let targetCreated = false;
  try {
    if (createsTargetBeforeClone(engineName, tier, postgresCloneMode)) {
      await engine.create(conn, target);
      targetCreated = true;
    }
    if (tier === "full") {
      if (engineName === "postgres") {
        await postgres.clone(conn, base, target, postgresCloneMode);
      } else {
        await engine.clone(conn, base, target);
      }
      targetCreated = true;
    }
    writeRegistry(registryDir, engineName, conn, base, normId, target, project);
  } catch (err) {
    if (targetCreated) {
      try {
        await engine.drop(conn, target);
      } catch {
        // preserve original error
      }
    }
    throw err;
  }

  if (flags.format === "json") {
    console.log(JSON.stringify({
      tool: "db-sandbox",
      command: "create",
      status: "created",
      fingerprint: {
        project,
        env_file: flags["env-file"] ?? "none",
        branch: identifier,
        engine: engineName,
        base,
        target,
        tier,
      },
    }, null, 2));
  } else {
    console.log(`db-sandbox:create [${engineName}]`);
    console.log(`  ├─ project   ${project}`);
    if (flags["env-file"]) {
      console.log(`  ├─ env_file  ${flags["env-file"]}`);
    }
    console.log(`  ├─ base      ${base}`);
    console.log(`  ├─ target    ${target}`);
    console.log(`  └─ status    ✔ created (${tier} copy)`);
  }
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

  if (entry?.PROJECT && entry.PROJECT !== process.cwd() && flags.force !== "true") {
    throw new Error(
      `sandbox '${identifier}' was created from ${entry.PROJECT}, not this repo (${process.cwd()}). ` +
        "Re-run with --force true if you're intentionally dropping another project's sandbox.",
    );
  }

  const path = registryPath(registryDir, engineName, conn, base, normId);
  if (!(await engine.exists(conn, target))) {
    if (entry) {
      if (existsSync(path)) unlinkSync(path);
      console.log(`pruned stale entry: ${target} (already gone from the database)`);
      return;
    }
    throw new Error(`nothing to drop, does not exist: '${target}'`);
  }
  await engine.drop(conn, target);

  if (existsSync(path)) unlinkSync(path);

  if (flags.format === "json") {
    console.log(JSON.stringify({
      tool: "db-sandbox",
      command: "drop",
      status: "dropped",
      fingerprint: {
        project: process.cwd(),
        engine: engineName,
        base,
        target,
      },
    }, null, 2));
  } else {
    console.log(`db-sandbox:drop [${engineName}]`);
    console.log(`  ├─ project   ${process.cwd()}`);
    console.log(`  ├─ base      ${base}`);
    console.log(`  ├─ target    ${target}`);
    console.log(`  └─ status    ✔ dropped`);
  }
}

function cmdList(flags: Flags): void {
  const registryDir = flags.registry ?? defaultRegistryRoot();
  const entries = listRegistry(registryDir, { engine: flags.engine, base: flags.base });

  if (flags.format === "json") {
    const jsonOutput = entries.map(([identifier, values]) => ({
      identifier,
      engine: values.ENGINE ?? "unknown",
      sandbox: values.SANDBOX_DB ?? "",
      base: values.BASE ?? "",
      project: values.PROJECT ?? "",
    }));
    console.log(JSON.stringify({
      tool: "db-sandbox",
      command: "list",
      status: "success",
      fingerprint: {
        project: process.cwd(),
        registry: registryDir,
        count: entries.length,
      },
      sandboxes: jsonOutput,
    }, null, 2));
    return;
  }

  console.log(`db-sandbox:list [${entries.length} registered]`);
  console.log(`  (registry: ${registryDir.replace(homedir(), "~")})`);
  if (entries.length === 0) {
    console.log("  └─ (no sandboxes registered)");
    return;
  }
  for (let i = 0; i < entries.length; i++) {
    const isLast = i === entries.length - 1;
    const branchChar = isLast ? "└─" : "├─";
    const [identifier, values] = entries[i];
    console.log(`  ${branchChar} ${identifier}: ${values.ENGINE ?? "?"} -> ${values.SANDBOX_DB ?? "?"} (base=${values.BASE ?? "?"})`);
  }
}
async function cmdPrune(flags: Flags): Promise<void> {
  const registryDir = flags.registry ?? defaultRegistryRoot();
  const entries = listRegistry(registryDir, { engine: flags.engine, base: flags.base });
  const stale: { identifier: string; engine: string; target: string; reason: string; path: string }[] = [];

  for (const [identifier, values] of entries) {
    const engineName = values.ENGINE as EngineName;
    const target = values.SANDBOX_DB ?? "";
    const regPath = values.REGISTRY_PATH ?? "";
    if (!engineName || !(engineName in REGISTRY) || !target) continue;

    const engine = REGISTRY[engineName];
    const conn: Conn = {
      host: values.HOST ?? "localhost",
      port: values.PORT ? Number(values.PORT) : undefined,
      user: values.USER,
      password: values.PASSWORD,
    };

    let exists = false;
    try {
      exists = await engine.exists(conn, target);
    } catch {
      exists = false;
    }

    if (!exists) {
      stale.push({
        identifier,
        engine: engineName,
        target,
        reason: "target database does not exist on disk/server",
        path: regPath,
      });
    }
  }

  const apply = flags.apply === "true";

  if (flags.format === "json") {
    console.log(JSON.stringify({
      tool: "db-sandbox",
      command: "prune",
      status: apply ? "pruned" : "preview",
      fingerprint: {
        project: process.cwd(),
        registry: registryDir,
        scanned: entries.length,
        staleCount: stale.length,
      },
      stale,
    }, null, 2));
  } else {
    console.log(`db-sandbox:prune [${apply ? "apply" : "preview"}]`);
    console.log(`  ├─ project   ${process.cwd()}`);
    console.log(`  ├─ scanned   ${entries.length} registered sandboxes`);
    if (stale.length === 0) {
      console.log(`  └─ status    ✔ all sandboxes are healthy (0 stale)`);
      return;
    }
    if (!apply) {
      console.log(`  ├─ stale     ${stale.length} dead entry/entries found:`);
      for (const item of stale) {
        console.log(`  │  └─ [${item.engine}] ${item.identifier} (${item.target}) -> ${item.reason}`);
      }
      console.log(`  └─ action    none (preview only; run with --apply to delete)`);
    } else {
      console.log(`  ├─ purging   ${stale.length} dead entry/entries:`);
      for (const item of stale) {
        if (item.path && existsSync(item.path)) {
          unlinkSync(item.path);
        }
        console.log(`  │  ✔ pruned ${item.identifier}`);
      }
      console.log(`  └─ status    ✔ registry clean`);
    }
  }
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.help === "true" || flags.h === "true") {
    printHelp();
    return;
  }

  if (positional[0] === "list") {
    cmdList(flags);
    return;
  }

  if (positional[0] === "prune") {
    await cmdPrune(flags);
    return;
  }

  let engineName: EngineName | undefined;
  let command: string | undefined;
  let identifier: string | undefined;

  const first = positional[0];
  if (first && first in REGISTRY) {
    engineName = first as EngineName;
    command = positional[1];
    identifier = positional[2];
  } else if (first === "create" || first === "drop") {
    command = first;
    identifier = positional[1];
    engineName = (flags.engine as EngineName) ?? autoDetectEngine(flags.base, process.env.DATABASE_URL);
  } else if (first === "list") {
    cmdList(flags);
    return;
  }

  if (flags.help === "true" || flags.h === "true" || (!command && positional.length === 0)) {
    printHelp();
    return;
  }

  if (!engineName || !(engineName in REGISTRY)) {
    throw new Error(`engine must be one of: ${Object.keys(REGISTRY).join(", ")}`);
  }

  if (!command && flags.help === "true") {
    printHelp();
    return;
  }

  if (command === "create") {
    const resolvedId = identifier ?? autoDetectCurrentBranch();
    if (!resolvedId) {
      throw new Error("create requires an identifier (or run from a git branch to auto-detect)");
    }
    await cmdCreate(engineName, resolvedId, flags);
  } else if (command === "drop") {
    if (!identifier) throw new Error("drop requires an identifier");
    await cmdDrop(engineName, identifier, flags);
  } else if (command === "list") {
    cmdList({ ...flags, engine: engineName });
  } else {
    throw new Error(`unknown command '${command}'. Expected create|drop|list|prune`);
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (err) {
    const msg = err && typeof err === "object" && "stderr" in err && err.stderr
      ? String(err.stderr).trim()
      : err instanceof Error ? err.message : String(err);
    console.error(msg);
    process.exit(1);
  }
}

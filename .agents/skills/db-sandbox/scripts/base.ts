/**
 * Shared, engine-agnostic guardrails, registry bookkeeping, and env-file
 * loading. Every engine adapter only implements exists/create/drop/clone;
 * all the "never touch the wrong database" logic lives here once.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";

export interface Conn {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
}

const LOOPBACK_HOSTS: Record<string, true> = { localhost: true, "127.0.0.1": true, "::1": true };
const DEFAULT_PORTS: Record<string, number> = { mysql: 3306, postgres: 5432 };

export function normalizeIdentifier(identifier: string): string {
  const normalized = identifier
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized) {
    throw new Error(`identifier normalizes to empty string: ${identifier}`);
  }
  return normalized;
}

/**
 * postgres/mysql: base is a database name -> "<base>_<id>".
 * sqlite: base is a file path -> sibling file "<stem>_<id><suffix>".
 */
export function deriveTarget(engine: string, base: string, normId: string): string {
  if (engine === "sqlite") {
    const ext = extname(base);
    const stem = basename(base, ext);
    return join(dirname(base), `${stem}_${normId}${ext}`);
  }
  return `${base}_${normId}`;
}

/**
 * Refuse to create/drop against any non-loopback host. Unconditional, no
 * override: the whole point of a sandbox is a disposable local clone, and
 * this tool must never be able to touch a remote/prod database.
 */
export function assertLocalTarget(host: string): void {
  if (!(host in LOOPBACK_HOSTS)) {
    throw new Error(`Refusing to touch non-local host '${host}'. Only localhost/127.0.0.1/::1 are allowed.`);
  }
}

/** A drop target must be a normalized sandbox of base, never base itself. */
export function assertDroppable(base: string, target: string): void {
  if (target === base) {
    throw new Error("Cannot drop the base database");
  }
  const isPathForm = base.includes("/") || target.includes("/");
  const isSandbox = isPathForm
    ? basename(target, extname(target)).startsWith(`${basename(base, extname(base))}_`)
    : target.startsWith(`${base}_`);
  if (!isSandbox) {
    throw new Error(`'${target}' is not a normalized sandbox of '${base}'`);
  }
}

/**
 * Fixed per-user, per-machine registry root - never cwd-relative. Two repos
 * (or two worktrees) on the same machine invoking this tool from different
 * directories resolve to the SAME registry, so `list` is always the
 * complete picture instead of silently missing sandboxes another repo
 * created. `--registry` still overrides this (tests, CI isolation).
 */
export function defaultRegistryRoot(): string {
  const stateHome = process.env.XDG_STATE_HOME || join(homedir(), ".local", "state");
  return join(stateHome, "db-sandbox", "registry");
}

/**
 * Composite key: engine + server + base db + identifier. The same
 * identifier used against two different engines, servers, or base
 * databases never collides - each is a genuinely different registry entry.
 *
 * Server bucket: same host+port for mysql/postgres, fixed "local" for
 * sqlite (no server). Base bucket: db name for mysql/postgres, canonical
 * path for sqlite - realpath (not just resolve) so a base referenced
 * through a symlinked path segment (e.g. macOS /tmp -> /private/tmp) and
 * the same file referenced without the symlink land in the same bucket
 * instead of registering as two unrelated sandboxes. Falls back to resolve()
 * when the file doesn't exist yet (create against a fresh path).
 */
function sqliteBaseKey(base: string): string {
  try {
    return realpathSync(base);
  } catch {
    return resolve(base);
  }
}

export function registryPath(registryDir: string, engine: string, conn: Conn, base: string, normId: string): string {
  const server =
    engine === "sqlite" ? "local" : normalizeIdentifier(`${conn.host ?? "localhost"}_${conn.port ?? DEFAULT_PORTS[engine]}`);
  const baseKey = normalizeIdentifier(engine === "sqlite" ? sqliteBaseKey(base) : base);
  return join(registryDir, engine, server, baseKey, `${normId}.env`);
}

export function writeRegistry(
  registryDir: string,
  engine: string,
  conn: Conn,
  base: string,
  normId: string,
  target: string,
  project: string,
): string {
  const path = registryPath(registryDir, engine, conn, base, normId);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const lines = [`ENGINE=${engine}`, `SANDBOX_DB=${target}`, `BASE=${base}`, `PROJECT=${project}`];
  if (engine !== "sqlite") {
    lines.push(`HOST=${conn.host ?? "localhost"}`, `PORT=${conn.port ?? DEFAULT_PORTS[engine]}`);
  }
  writeFileSync(path, lines.join("\n") + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

function parseDotenv(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function readRegistry(
  registryDir: string,
  engine: string,
  conn: Conn,
  base: string,
  normId: string,
): Record<string, string> | null {
  const path = registryPath(registryDir, engine, conn, base, normId);
  if (!existsSync(path)) return null;
  return parseDotenv(readFileSync(path, "utf8"));
}

function walkEnvFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkEnvFiles(full));
    else if (entry.name.endsWith(".env")) out.push(full);
  }
  return out;
}

/** Whole-registry view (optionally filtered), regardless of nesting - the shared inventory across every repo. */
export function listRegistry(
  registryDir: string,
  filter?: { engine?: string; base?: string },
): [string, Record<string, string>][] {
  return walkEnvFiles(registryDir)
    .map((path): [string, Record<string, string>] => [basename(path, ".env"), parseDotenv(readFileSync(path, "utf8"))])
    .filter(([, v]) => (!filter?.engine || v.ENGINE === filter.engine) && (!filter?.base || v.BASE === filter.base))
    .sort(([a], [b]) => a.localeCompare(b));
}

/**
 * Load KEY=VALUE pairs from a project's own env file (e.g. .env.local).
 * Lets a project agent inject its real connection config with --env-file
 * instead of the skill hardcoding any project's variable names/paths.
 */
export function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    throw new Error(`--env-file not found: ${path}`);
  }
  return parseDotenv(readFileSync(path, "utf8"));
}

/**
 * Resolve one connection field with precedence:
 * explicit CLI flag > --env-file entry > ambient process.env > fallback.
 */
export function resolveField(
  cliValue: string | undefined,
  envFileValues: Record<string, string>,
  envKey: string,
  fallback?: string,
): string | undefined {
  return cliValue ?? envFileValues[envKey] ?? process.env[envKey] ?? fallback;
}

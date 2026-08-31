#!/usr/bin/env bun
/**
 * Runnable self-check. No framework: plain asserts, run directly.
 *
 *   SKILL_DIR="${SKILL_DIR:-$HOME/.agents/skills/db-sandbox}"
 *   bun "$SKILL_DIR/scripts/test_sandbox.ts"
 *
 * Covers base.ts guardrails, the composite-key registry (self-heal on stale
 * entries, cross-project drop guard), resolveConfig's --env-file precedence,
 * and the sqlite engine end-to-end through the real sandbox.ts CLI.
 * Postgres/MySQL adapters are command-builders around real server binaries
 * and are not exercised here without a live server; their SQL/argv
 * construction is straightforward enough to read directly
 * (engines/postgres.ts, mysql.ts).
 */

import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createsTargetBeforeClone } from "./sandbox";
import { assertDroppable, assertLocalTarget, defaultRegistryRoot, normalizeIdentifier, readRegistry } from "./base";

function testNormalizeIdentifier(): void {
  if (normalizeIdentifier("Feature/JIRA-123") !== "feature_jira_123") {
    throw new Error("normalizeIdentifier mismatch for 'Feature/JIRA-123'");
  }
  if (normalizeIdentifier("simple") !== "simple") {
    throw new Error("normalizeIdentifier mismatch for 'simple'");
  }
  let threw = false;
  try {
    normalizeIdentifier("///");
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("expected throw on all-punctuation identifier");
}

function testPostgresFullCloneSkipsPrecreate(): void {
  if (createsTargetBeforeClone("postgres", "full")) {
    throw new Error("PostgreSQL full template clone must not create the target first");
  }
  if (!createsTargetBeforeClone("postgres", "full", "logical")) {
    throw new Error("PostgreSQL full logical clone must create the target first");
  }
  if (!createsTargetBeforeClone("postgres", "bare")) {
    throw new Error("PostgreSQL bare sandbox must create an empty target");
  }
  if (!createsTargetBeforeClone("mysql", "full")) {
    throw new Error("MySQL full clone must create the target before cloning");
  }
}

function testAssertLocalTarget(): void {
  assertLocalTarget("localhost"); // must not throw
  assertLocalTarget("127.0.0.1");
  let threw = false;
  try {
    assertLocalTarget("prod-db.internal");
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("expected throw for non-loopback host");
}

function testAssertDroppable(): void {
  assertDroppable("app_dev", "app_dev_feature_x"); // must not throw
  let threw = false;
  try {
    assertDroppable("app_dev", "app_dev");
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("expected throw dropping the base itself");
  threw = false;
  try {
    assertDroppable("app_dev", "some_unrelated_db");
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("expected throw dropping a non-sandbox name");
}

/** Pure function - override XDG_STATE_HOME rather than touching the real machine root. */
function testDefaultRegistryRoot(): void {
  const prev = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = "/tmp/db-sandbox-xdg-test";
  try {
    const root = defaultRegistryRoot();
    if (root !== join("/tmp/db-sandbox-xdg-test", "db-sandbox", "registry")) {
      throw new Error(`unexpected default registry root: ${root}`);
    }
  } finally {
    if (prev === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = prev;
  }
}

async function runCli(...args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bun", join(import.meta.dir, "sandbox.ts"), ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

async function testSqliteEndToEnd(): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), "db-sandbox-test-"));
  try {
    const baseDb = join(tmp, "app.db");
    const registry = join(tmp, ".db-sandboxes");

    const db = new Database(baseDb, { create: true });
    db.run("CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT)");
    db.run("INSERT INTO widgets (name) VALUES ('gizmo')");
    db.close();

    let result = await runCli("sqlite", "--registry", registry, "create", "feature-x", "--base", baseDb);
    if (result.exitCode !== 0) throw new Error(`create failed: ${result.stderr}`);
    const target = join(tmp, "app_feature_x.db");
    if (!existsSync(target)) throw new Error("expected cloned sandbox file to exist");

    const cloned = new Database(target, { readonly: true });
    const rows = cloned.query("SELECT name FROM widgets").all() as { name: string }[];
    cloned.close();
    if (rows.length !== 1 || rows[0].name !== "gizmo") {
      throw new Error(`clone did not carry data: ${JSON.stringify(rows)}`);
    }

    result = await runCli("sqlite", "--registry", registry, "create", "feature-x", "--base", baseDb);
    if (result.exitCode === 0) throw new Error("expected create to reject an already-registered identifier");

    result = await runCli("sqlite", "--registry", registry, "drop", "feature-x", "--base", baseDb);
    if (result.exitCode === 0) throw new Error("expected drop without --confirm DROP to fail");
    if (!existsSync(target)) throw new Error("sandbox must survive an unconfirmed drop");

    result = await runCli(
      "sqlite", "--registry", registry, "drop", "feature-x", "--base", baseDb, "--confirm", "DROP",
    );
    if (result.exitCode !== 0) throw new Error(`drop failed: ${result.stderr}`);
    if (existsSync(target)) throw new Error("expected sandbox file removed after drop");
    if (readRegistry(registry, "sqlite", {}, baseDb, "feature_x") !== null) {
      throw new Error("expected registry entry removed");
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** --base omitted entirely: must come from --env-file's DB_PATH, proving injection works. */
async function testEnvFileInjectsBase(): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), "db-sandbox-test-env-"));
  try {
    const baseDb = join(tmp, "app.db");
    const registry = join(tmp, ".db-sandboxes");
    const envFile = join(tmp, ".env.local");

    const db = new Database(baseDb, { create: true });
    db.run("CREATE TABLE t (id INTEGER PRIMARY KEY)");
    db.close();

    writeFileSync(envFile, `# project env\nDB_PATH=${baseDb}\n`);

    const result = await runCli(
      "sqlite", "--registry", registry, "create", "feature-y", "--env-file", envFile,
    );
    if (result.exitCode !== 0) throw new Error(`create via --env-file failed: ${result.stderr}`);
    const target = join(tmp, "app_feature_y.db");
    if (!existsSync(target)) throw new Error("expected --env-file's DB_PATH to supply --base");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** A sandbox dropped outside the tool must self-heal, not permanently squat the identifier. */
async function testStaleEntryPruning(): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), "db-sandbox-test-stale-"));
  try {
    const baseDb = join(tmp, "app.db");
    const registry = join(tmp, ".db-sandboxes");

    const db = new Database(baseDb, { create: true });
    db.run("CREATE TABLE t (id INTEGER PRIMARY KEY)");
    db.close();

    let result = await runCli("sqlite", "--registry", registry, "create", "stale-x", "--base", baseDb);
    if (result.exitCode !== 0) throw new Error(`create failed: ${result.stderr}`);
    const target = join(tmp, "app_stale_x.db");

    // Simulate the sandbox being removed outside the tool (manual DROP, crash mid-clone, ...).
    rmSync(target);

    result = await runCli("sqlite", "--registry", registry, "drop", "stale-x", "--base", baseDb, "--confirm", "DROP");
    if (result.exitCode !== 0) throw new Error(`expected pruning drop to succeed: ${result.stderr}`);
    if (!result.stdout.includes("pruned stale entry")) {
      throw new Error(`expected pruned-stale message, got: ${result.stdout}`);
    }
    if (readRegistry(registry, "sqlite", {}, baseDb, "stale_x") !== null) {
      throw new Error("expected stale registry entry removed");
    }

    // Identifier must be immediately reusable after pruning, not permanently blocked.
    result = await runCli("sqlite", "--registry", registry, "create", "stale-x", "--base", baseDb);
    if (result.exitCode !== 0) throw new Error(`expected recreate after prune to succeed: ${result.stderr}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Shared registry means shared destructive access - drop must refuse a
 * sandbox registered from a different project directory unless forced.
 * Relies on process.chdir() immediately before each spawn (single-threaded,
 * no other chdir runs between the two lines) so the two runCli calls record
 * different PROJECT values, simulating two separate repos on one machine.
 */
async function testCrossProjectOwnershipGuard(): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), "db-sandbox-test-owner-"));
  const originalCwd = process.cwd();
  try {
    const baseDb = join(tmp, "app.db");
    const registry = join(tmp, ".db-sandboxes");
    const projectA = join(tmp, "repo-a");
    const projectB = join(tmp, "repo-b");
    mkdirSync(projectA, { recursive: true });
    mkdirSync(projectB, { recursive: true });

    const db = new Database(baseDb, { create: true });
    db.run("CREATE TABLE t (id INTEGER PRIMARY KEY)");
    db.close();

    process.chdir(projectA);
    let result = await runCli("sqlite", "--registry", registry, "create", "shared-x", "--base", baseDb);
    if (result.exitCode !== 0) throw new Error(`create failed: ${result.stderr}`);

    process.chdir(projectB);
    result = await runCli("sqlite", "--registry", registry, "drop", "shared-x", "--base", baseDb, "--confirm", "DROP");
    if (result.exitCode === 0) throw new Error("expected drop from a different project to be refused");
    if (!result.stderr.includes("not this repo")) {
      throw new Error(`expected ownership-mismatch error, got: ${result.stderr}`);
    }
    const target = join(tmp, "app_shared_x.db");
    if (!existsSync(target)) throw new Error("sandbox must survive a cross-project drop attempt");

    result = await runCli(
      "sqlite", "--registry", registry, "drop", "shared-x", "--base", baseDb, "--confirm", "DROP", "--force", "true",
    );
    if (result.exitCode !== 0) throw new Error(`expected --force drop to succeed: ${result.stderr}`);
  } finally {
    process.chdir(originalCwd);
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** `list` (no engine positional) must see entries across engines from any cwd, unfiltered. */
async function testListIsEngineAgnosticAndCentralized(): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), "db-sandbox-test-list-"));
  try {
    const baseDb = join(tmp, "app.db");
    const registry = join(tmp, ".db-sandboxes");

    const db = new Database(baseDb, { create: true });
    db.run("CREATE TABLE t (id INTEGER PRIMARY KEY)");
    db.close();

    let result = await runCli("sqlite", "--registry", registry, "create", "list-x", "--base", baseDb);
    if (result.exitCode !== 0) throw new Error(`create failed: ${result.stderr}`);

    result = await runCli("--registry", registry, "list");
    if (result.exitCode !== 0) throw new Error(`list failed: ${result.stderr}`);
    if (!result.stdout.includes("list_x: sqlite ->") || !result.stdout.includes(`project=${process.cwd()}`)) {
      throw new Error(`expected engine-agnostic list to show the entry with its project, got: ${result.stdout}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Same physical sqlite file, referenced through a symlinked directory vs.
 * the real path (e.g. macOS /tmp -> /private/tmp), must resolve to the SAME
 * registry entry - a `create` through one spelling and a `drop` through the
 * other must not silently alias into two disconnected sandboxes.
 */
async function testSymlinkedBasePathAliasing(): Promise<void> {
  const tmp = mkdtempSync(join(tmpdir(), "db-sandbox-test-symlink-"));
  try {
    const realDir = join(tmp, "real");
    mkdirSync(realDir);
    const linkDir = join(tmp, "link");
    symlinkSync(realDir, linkDir);
    const registry = join(tmp, ".db-sandboxes");

    const baseViaReal = join(realDir, "app.db");
    const baseViaLink = join(linkDir, "app.db");

    const db = new Database(baseViaReal, { create: true });
    db.run("CREATE TABLE t (id INTEGER PRIMARY KEY)");
    db.close();

    let result = await runCli("sqlite", "--registry", registry, "create", "alias-x", "--base", baseViaLink);
    if (result.exitCode !== 0) throw new Error(`create via symlinked base failed: ${result.stderr}`);

    // Drop through the OTHER path spelling for the same physical file - must
    // find the entry create() just registered, not report "nothing to drop".
    result = await runCli("sqlite", "--registry", registry, "drop", "alias-x", "--base", baseViaReal, "--confirm", "DROP");
    if (result.exitCode !== 0) {
      throw new Error(`expected drop through the real path to find the entry created via the symlinked path: ${result.stderr}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function demo(): Promise<void> {
  const tests: [string, () => void | Promise<void>][] = [
    ["testNormalizeIdentifier", testNormalizeIdentifier],
    ["testAssertLocalTarget", testAssertLocalTarget],
    ["testAssertDroppable", testAssertDroppable],
    ["testDefaultRegistryRoot", testDefaultRegistryRoot],
    ["testPostgresFullCloneSkipsPrecreate", testPostgresFullCloneSkipsPrecreate],
    ["testSqliteEndToEnd", testSqliteEndToEnd],
    ["testEnvFileInjectsBase", testEnvFileInjectsBase],
    ["testStaleEntryPruning", testStaleEntryPruning],
    ["testCrossProjectOwnershipGuard", testCrossProjectOwnershipGuard],
    ["testListIsEngineAgnosticAndCentralized", testListIsEngineAgnosticAndCentralized],
    ["testSymlinkedBasePathAliasing", testSymlinkedBasePathAliasing],
  ];
  for (const [name, fn] of tests) {
    await fn();
    console.log(`ok: ${name}`);
  }
  console.log("all checks passed");
}

if (import.meta.main) {
  await demo();
}

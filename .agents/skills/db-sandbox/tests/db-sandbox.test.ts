import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertDroppable,
  assertLocalTarget,
  defaultRegistryRoot,
  normalizeIdentifier,
  parseDbUrl,
  readRegistry,
} from "../scripts/base";
import { createsTargetBeforeClone } from "../scripts/sandbox";

async function runCli(...args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bun", join(import.meta.dir, "../scripts/sandbox.ts"), ...args], {
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

describe("given db-sandbox CLI, when managing isolated databases, then enforces safety and lifecycle rules", () => {
  it("normalizes identifiers and throws on empty/punctuation strings", () => {
    expect(normalizeIdentifier("Feature/JIRA-123")).toBe("feature_jira_123");
    expect(normalizeIdentifier("simple")).toBe("simple");
    expect(() => normalizeIdentifier("///")).toThrow();
  });

  it("determines whether target creation precedes cloning per engine tier", () => {
    expect(createsTargetBeforeClone("postgres", "full")).toBe(false);
    expect(createsTargetBeforeClone("postgres", "full", "logical")).toBe(true);
    expect(createsTargetBeforeClone("postgres", "bare")).toBe(true);
    expect(createsTargetBeforeClone("mysql", "full")).toBe(true);
  });

  it("enforces local-only loopback host targets", () => {
    expect(() => assertLocalTarget("localhost")).not.toThrow();
    expect(() => assertLocalTarget("127.0.0.1")).not.toThrow();
    expect(() => assertLocalTarget("prod-db.internal")).toThrow();
  });

  it("prevents dropping the base database or unrelated databases", () => {
    expect(() => assertDroppable("app_dev", "app_dev_feature_x")).not.toThrow();
    expect(() => assertDroppable("app_dev", "app_dev")).toThrow();
    expect(() => assertDroppable("app_dev", "unrelated_db")).toThrow();
  });

  it("computes default registry root from XDG_STATE_HOME", () => {
    const prev = process.env.XDG_STATE_HOME;
    process.env.XDG_STATE_HOME = "/tmp/db-sandbox-xdg-test";
    try {
      const root = defaultRegistryRoot();
      expect(root).toBe(join("/tmp/db-sandbox-xdg-test", "db-sandbox", "registry"));
    } finally {
      if (prev === undefined) delete process.env.XDG_STATE_HOME;
      else process.env.XDG_STATE_HOME = prev;
    }
  });

  it("creates, verifies, and drops sqlite sandboxes end-to-end", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "db-sandbox-test-"));
    try {
      const baseDb = join(tmp, "app.db");
      const registry = join(tmp, ".db-sandboxes");

      const db = new Database(baseDb, { create: true });
      db.run("CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT)");
      db.run("INSERT INTO widgets (name) VALUES ('gizmo')");
      db.close();

      let result = await runCli("sqlite", "--registry", registry, "create", "feature-x", "--base", baseDb);
      expect(result.exitCode).toBe(0);
      const target = join(tmp, "app_feature_x.db");
      expect(existsSync(target)).toBe(true);

      const cloned = new Database(target, { readonly: true });
      const rows = cloned.query("SELECT name FROM widgets").all() as { name: string }[];
      cloned.close();
      expect(rows.length).toBe(1);
      expect(rows[0].name).toBe("gizmo");

      result = await runCli("sqlite", "--registry", registry, "create", "feature-x", "--base", baseDb);
      expect(result.exitCode).not.toBe(0);

      result = await runCli("sqlite", "--registry", registry, "drop", "feature-x", "--base", baseDb);
      expect(result.exitCode).not.toBe(0);
      expect(existsSync(target)).toBe(true);

      result = await runCli("sqlite", "--registry", registry, "drop", "feature-x", "--base", baseDb, "--confirm", "DROP");
      expect(result.exitCode).toBe(0);
      expect(existsSync(target)).toBe(false);
      expect(readRegistry(registry, "sqlite", {}, baseDb, "feature_x")).toBeNull();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("injects base database path from --env-file DB_PATH", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "db-sandbox-test-env-"));
    try {
      const baseDb = join(tmp, "app.db");
      const registry = join(tmp, ".db-sandboxes");
      const envFile = join(tmp, ".env.local");

      const db = new Database(baseDb, { create: true });
      db.run("CREATE TABLE t (id INTEGER PRIMARY KEY)");
      db.close();

      writeFileSync(envFile, `# project env\nDB_PATH=${baseDb}\n`);

      const result = await runCli("sqlite", "--registry", registry, "create", "feature-y", "--env-file", envFile);
      expect(result.exitCode).toBe(0);
      const target = join(tmp, "app_feature_y.db");
      expect(existsSync(target)).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("supports safe preview by default for prune and requires --apply to delete", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "db-sandbox-test-prune-"));
    try {
      const baseDb = join(tmp, "app.db");
      const registry = join(tmp, ".db-sandboxes");

      const db = new Database(baseDb, { create: true });
      db.run("CREATE TABLE t (id INTEGER PRIMARY KEY)");
      db.close();

      let result = await runCli("sqlite", "--registry", registry, "create", "prune-x", "--base", baseDb);
      expect(result.exitCode).toBe(0);
      const target = join(tmp, "app_prune_x.db");

      // Manually remove target to make it stale
      rmSync(target);

      // Default prune is a preview
      result = await runCli("--registry", registry, "prune");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("[preview]");
      expect(result.stdout).toContain("prune_x");
      expect(readRegistry(registry, "sqlite", {}, baseDb, "prune_x")).not.toBeNull();

      // Prune with --apply commits deletions
      result = await runCli("--registry", registry, "prune", "--apply");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("pruned prune_x");
      expect(readRegistry(registry, "sqlite", {}, baseDb, "prune_x")).toBeNull();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("supports --format=json output on list command", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "db-sandbox-test-json-"));
    try {
      const baseDb = join(tmp, "app.db");
      const registry = join(tmp, ".db-sandboxes");

      const db = new Database(baseDb, { create: true });
      db.run("CREATE TABLE t (id INTEGER PRIMARY KEY)");
      db.close();

      let result = await runCli("sqlite", "--registry", registry, "create", "json-x", "--base", baseDb);
      expect(result.exitCode).toBe(0);

      result = await runCli("--registry", registry, "list", "--format=json");
      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(Array.isArray(parsed.sandboxes)).toBe(true);
      expect(parsed.sandboxes.length).toBeGreaterThan(0);
      expect(parsed.sandboxes[0].identifier).toBe("json_x");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("auto-detects sqlite engine from .db extension without engine argument", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "db-sandbox-test-autodetect-"));
    try {
      const baseDb = join(tmp, "auto.db");
      const registry = join(tmp, ".db-sandboxes");

      const db = new Database(baseDb, { create: true });
      db.run("CREATE TABLE t (id INTEGER PRIMARY KEY)");
      db.close();

      const result = await runCli("create", "auto-x", "--base", baseDb, "--registry", registry);
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(tmp, "auto_auto_x.db"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("guards against cross-project drops without --force true", async () => {
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
      expect(result.exitCode).toBe(0);

      process.chdir(projectB);
      result = await runCli("sqlite", "--registry", registry, "drop", "shared-x", "--base", baseDb, "--confirm", "DROP");
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("not this repo");

      result = await runCli("sqlite", "--registry", registry, "drop", "shared-x", "--base", baseDb, "--confirm", "DROP", "--force", "true");
      expect(result.exitCode).toBe(0);
    } finally {
      process.chdir(originalCwd);
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("parses connection URL strings accurately", () => {
    const parsed = parseDbUrl("postgresql://myuser:secret123@127.0.0.1:5430/my_db?schema=public");
    expect(parsed.user).toBe("myuser");
    expect(parsed.password).toBe("secret123");
    expect(parsed.host).toBe("127.0.0.1");
    expect(parsed.port).toBe(5430);
    expect(parsed.base).toBe("my_db");
  });

  it("handles --help and -h flags cleanly", async () => {
    let res = await runCli("--help");
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("Usage:");

    res = await runCli("-h");
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("Usage:");

    res = await runCli("mysql", "--help");
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain("Usage:");
  });
});

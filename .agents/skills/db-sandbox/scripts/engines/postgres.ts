/**
 * PostgreSQL adapter. Ordinary databases use native TEMPLATE cloning.
 * TimescaleDB databases use logical dump/restore because background workers
 * keep the source database active and block TEMPLATE cloning.
 */

import { $ } from "bun";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Conn } from "../base";

const MAINTENANCE_DB = "postgres"; // always-present db used to run admin statements

export type CloneMode = "template" | "logical";

function pgEnvironment(conn: Conn): NodeJS.ProcessEnv {
  return conn.password ? { ...process.env, PGPASSWORD: conn.password } : process.env;
}

async function psql(conn: Conn, database: string, sql: string): Promise<string> {
  return await $`psql -h ${conn.host ?? "localhost"} -p ${conn.port ?? 5432} -U ${conn.user ?? "postgres"} -d ${database} -tAc ${sql}`
    .env(pgEnvironment(conn))
    .text();
}

async function isTimescale(conn: Conn, database: string): Promise<boolean> {
  const out = await psql(
    conn,
    database,
    "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb')",
  );
  return out.trim() === "t";
}

export async function resolveCloneMode(conn: Conn, source: string): Promise<CloneMode> {
  return (await isTimescale(conn, source)) ? "logical" : "template";
}

export async function exists(conn: Conn, target: string): Promise<boolean> {
  const out = await psql(conn, MAINTENANCE_DB, `SELECT 1 FROM pg_database WHERE datname='${target}'`);
  return out.trim().length > 0;
}

export async function create(conn: Conn, target: string): Promise<void> {
  await psql(conn, MAINTENANCE_DB, `CREATE DATABASE "${target}"`);
}

export async function drop(conn: Conn, target: string): Promise<void> {
  await psql(conn, MAINTENANCE_DB, `DROP DATABASE "${target}"`);
}

async function logicalClone(conn: Conn, source: string, target: string): Promise<void> {
  const dumpDir = mkdtempSync(join(tmpdir(), "db-sandbox-pg-"));
  const dumpPath = join(dumpDir, "database.dump");
  try {
    await $`pg_dump -h ${conn.host ?? "localhost"} -p ${conn.port ?? 5432} -U ${conn.user ?? "postgres"} -d ${source} -Fc -f ${dumpPath}`
      .env(pgEnvironment(conn));
    await psql(conn, target, "CREATE EXTENSION IF NOT EXISTS timescaledb");
    await psql(conn, target, "SELECT timescaledb_pre_restore()");
    await $`pg_restore -h ${conn.host ?? "localhost"} -p ${conn.port ?? 5432} -U ${conn.user ?? "postgres"} -d ${target} --no-owner --no-privileges --exit-on-error ${dumpPath}`
      .env(pgEnvironment(conn));
    await psql(conn, target, "SELECT timescaledb_post_restore()");
  } finally {
    rmSync(dumpDir, { recursive: true, force: true });
  }
}

export async function clone(
  conn: Conn,
  source: string,
  target: string,
  mode: CloneMode = "template",
): Promise<void> {
  if (mode === "logical") {
    await logicalClone(conn, source, target);
    return;
  }
  await psql(conn, MAINTENANCE_DB, `CREATE DATABASE "${target}" TEMPLATE "${source}"`);
}

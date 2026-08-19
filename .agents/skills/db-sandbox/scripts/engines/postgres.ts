/**
 * Postgres adapter. Clone uses native `CREATE DATABASE ... TEMPLATE` (one
 * statement, no dump/restore pipe).
 *
 * Caveat: TEMPLATE requires no other session connected to the source
 * database at clone time, or Postgres raises "source database is being
 * accessed by other users". Close notebook/shell connections first.
 */

import { $ } from "bun";
import type { Conn } from "../base";

const MAINTENANCE_DB = "postgres"; // always-present db used to run admin statements

async function psql(conn: Conn, database: string, sql: string): Promise<string> {
  const env = conn.password ? { ...process.env, PGPASSWORD: conn.password } : process.env;
  return await $`psql -h ${conn.host ?? "localhost"} -p ${conn.port ?? 5432} -U ${conn.user ?? "postgres"} -d ${database} -tAc ${sql}`
    .env(env)
    .text();
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

export async function clone(conn: Conn, source: string, target: string): Promise<void> {
  await psql(conn, MAINTENANCE_DB, `CREATE DATABASE "${target}" TEMPLATE "${source}"`);
}

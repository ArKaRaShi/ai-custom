/**
 * MySQL adapter. Credentials go through a temp defaults-file, never
 * argv/env, so they never leak via `ps`. Bun's shell ($) runs the
 * mysqldump | mysql pipe directly instead of manual Popen plumbing.
 */

import { $ } from "bun";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Conn } from "../base";

async function withDefaultsFile<T>(conn: Conn, fn: (defaultsPath: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "db-sandbox-mysql-"));
  const path = join(dir, "defaults.cnf");
  let content = `[client]\nhost=${conn.host ?? "localhost"}\nport=${conn.port ?? 3306}\nuser=${conn.user ?? "root"}\n`;
  if (conn.password) content += `password=${conn.password}\n`;
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
  try {
    return await fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function exists(conn: Conn, target: string): Promise<boolean> {
  return withDefaultsFile(conn, async (defaults) => {
    const sql = `SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = '${target}'`;
    const out = await $`mysql --defaults-extra-file=${defaults} --batch --skip-column-names --execute=${sql}`.text();
    return out.trim().length > 0;
  });
}

export async function create(conn: Conn, target: string): Promise<void> {
  await withDefaultsFile(conn, async (defaults) => {
    await $`mysql --defaults-extra-file=${defaults} --execute=${`CREATE DATABASE \`${target}\``}`;
  });
}

export async function drop(conn: Conn, target: string): Promise<void> {
  await withDefaultsFile(conn, async (defaults) => {
    await $`mysql --defaults-extra-file=${defaults} --execute=${`DROP DATABASE \`${target}\``}`;
  });
}

export async function clone(conn: Conn, source: string, target: string): Promise<void> {
  await withDefaultsFile(conn, async (defaults) => {
    await $`mysqldump --defaults-extra-file=${defaults} --single-transaction --routines --triggers --no-tablespaces --skip-masking-policies ${source} | mysql --defaults-extra-file=${defaults} ${target}`;
  });
}

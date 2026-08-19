/**
 * SQLite adapter: a "database" is just a file path. No server, no conn.
 * These four functions are the polymorphic engine contract dispatched by
 * sandbox.ts (REGISTRY[engineName].create/...) — kept even though each body
 * is a single fs call, so every engine satisfies the same interface.
 */

import { closeSync, copyFileSync, existsSync, openSync, unlinkSync } from "node:fs";
import type { Conn } from "../base";

export async function exists(_conn: Conn, target: string): Promise<boolean> {
  return existsSync(target);
}

export async function create(_conn: Conn, target: string): Promise<void> {
  if (existsSync(target)) {
    throw new Error(`file already exists: ${target}`);
  }
  closeSync(openSync(target, "wx")); // touch; "wx" fails if it raced into existence
}

export async function clone(_conn: Conn, source: string, target: string): Promise<void> {
  if (!existsSync(source)) {
    throw new Error(`base database does not exist: ${source}`);
  }
  copyFileSync(source, target);
}

export async function drop(_conn: Conn, target: string): Promise<void> {
  unlinkSync(target);
}

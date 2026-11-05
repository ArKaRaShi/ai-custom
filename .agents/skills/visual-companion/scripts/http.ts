import { lstat } from "node:fs/promises";
import { join } from "node:path";

const BASE_HEADERS: Record<string, string> = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

export function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { ...BASE_HEADERS, "content-type": "text/html; charset=utf-8" },
  });
}

export function jsonResponse(value: unknown, status = 200): Response {
  return new Response(`${JSON.stringify(value)}\n`, {
    status,
    headers: { ...BASE_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

export function notFound(): Response {
  return new Response("Not found", { status: 404, headers: BASE_HEADERS });
}

/**
 * Boundary guard for every file served from a directory: no dotfiles, no
 * symlinks, no directories, nothing that escapes through the name.
 */
export async function inside(dir: string, requested: string): Promise<string | null> {
  const parts = requested.split("/");
  if (parts.some((part) => !part || part.startsWith(".") || part.includes("\\"))) return null;
  let path = dir;
  try {
    if (!(await lstat(dir)).isDirectory()) return null;
    for (let i = 0; i < parts.length; i++) {
      path = join(path, parts[i]!);
      const entry = await lstat(path);
      if (i === parts.length - 1 ? !entry.isFile() : !entry.isDirectory()) return null;
    }
  } catch {
    return null;
  }
  return path;
}

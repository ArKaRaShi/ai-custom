import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function cookieName(key: string): string {
  return `vc-${createHash("sha256").update(key).digest("hex").slice(0, 32)}`;
}

export function createKey(): string {
  return randomBytes(32).toString("hex");
}

/** Constant-time compare that does not leak length differences through timing. */
export function keyMatches(given: string, key: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

/** A request is authorised by `?key=` or by the session cookie. */
export function isAuthorized(req: Request, key: string): boolean {
  const url = new URL(req.url);
  const query = url.searchParams.get("key");
  if (query) return keyMatches(query, key);
  const cookie = parseCookies(req.headers.get("cookie"))[cookieName(key)];
  return Boolean(cookie && keyMatches(cookie, key));
}

export function cookieHeader(key: string): string {
  return `${cookieName(key)}=${key}; HttpOnly; SameSite=Strict; Path=/`;
}

/**
 * Cross-origin pages can open a WebSocket to localhost, so the upgrade must
 * come from our own origin. A missing Origin (curl, tests) is allowed because
 * the key still gates it.
 */
export function originAllowed(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

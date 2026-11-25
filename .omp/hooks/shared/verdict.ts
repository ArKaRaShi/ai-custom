import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

// Every hook declares one category. The category fixes which returns the hook may
// build: advisory and warn only add context, error and block stop the call, sanitize
// rewrites tool output, and observe only touches the outside world.

export type HookCategory = "advisory" | "warn" | "error" | "block" | "sanitize" | "observe";

export interface HookMeta {
  /** Kebab-case identity used in every message prefix. */
  id: string;
  /** Highest severity this hook may emit. */
  category: HookCategory;
  /** Every event the factory registers, so the structure test can catch drift. */
  events: readonly string[];
  /** Standard docs this hook points an agent at, relative to the ai-custom repo root. */
  standards: readonly string[];
}

export interface Verdict {
  block?: boolean;
  reason?: string;
  additionalContext?: string;
}

export interface ContentPatch {
  content: unknown[];
  details?: unknown;
}

export type BlockingMeta = HookMeta & { category: "error" | "block" };
export type SanitizingMeta = HookMeta & { category: "sanitize" };

function tag(meta: HookMeta, kind: HookCategory): string {
  return `[omp-hook:${meta.id}:${kind}]`;
}

/** Point the agent at a rule before it can break it. The call still runs. */
export function advisory(meta: HookMeta, note: string): Verdict {
  return { additionalContext: `${tag(meta, "advisory")} ${note}` };
}

/** Flag a call that is legal but almost always wrong. The call still runs. */
export function warn(meta: HookMeta, note: string): Verdict {
  return { additionalContext: `${tag(meta, "warn")} ⚠ ${note}` };
}

/** Refuse input that cannot succeed, and name the call that can. */
export function error(meta: BlockingMeta, reason: string, fix: string): Verdict {
  return { block: true, reason: `${tag(meta, "error")} ${reason} Fix: ${fix}` };
}

/** Refuse an action that risks data or safety. No automatic retry. */
export function block(meta: BlockingMeta, reason: string): Verdict {
  return { block: true, reason: `${tag(meta, "block")} ${reason}` };
}

/** Replace tool output before the model sees it. */
export function sanitized(meta: SanitizingMeta, content: unknown[], details?: unknown): ContentPatch {
  return details === undefined ? { content } : { content, details };
}

export interface SessionOnce {
  take(key: string): boolean;
  reset(): void;
}

/** Deliver a note once per session per key, so repeated calls stay quiet. */
export function sessionOnce(): SessionOnce {
  let seen = new Set<string>();
  return {
    take(key: string): boolean {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
    reset(): void {
      seen = new Set<string>();
    },
  };
}

export interface Resettable {
  reset(): void;
}

export function resetOnSessionChange(pi: HookAPI, ...trackers: Resettable[]): void {
  const reset = (): void => {
    for (const tracker of trackers) tracker.reset();
  };
  pi.on("session_start", reset);
  pi.on("session_clear", reset);
}

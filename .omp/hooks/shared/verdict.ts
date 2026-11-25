// Every hook declares one category. The category fixes which returns the hook may
// build: advisory and warn only add context, error and block stop the call, sanitize
// rewrites tool output, and observe only touches the outside world.

/** The slice of the hook API this module needs, so it type-checks without the runtime's declarations. */
export interface EventSource {
  on(event: string, handler: () => void): void;
}

export const HOOK_CATEGORIES = {
  ADVISORY: { effect: "context", retry: "none" },
  WARN: { effect: "context", retry: "none" },
  ERROR: { effect: "block", retry: "fixed-call" },
  BLOCK: { effect: "block", retry: "human" },
  SANITIZE: { effect: "content", retry: "none" },
  OBSERVE: { effect: "none", retry: "none" },
} as const;

export type HookCategory = keyof typeof HOOK_CATEGORIES;

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

export type BlockingMeta = HookMeta & { category: "ERROR" | "BLOCK" };
export type SanitizingMeta = HookMeta & { category: "SANITIZE" };

/** Report every way a hook's declaration breaks the contract. Pure, so any runtime can call it. */
export function checkHookMeta(meta: HookMeta): string[] {
  const problems: string[] = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(meta.id)) problems.push(`id "${meta.id}" is not kebab-case`);
  if (!(meta.category in HOOK_CATEGORIES)) problems.push(`category "${meta.category}" is not in HOOK_CATEGORIES`);
  if (!Array.isArray(meta.events) || meta.events.length === 0) problems.push("events is empty");
  if (!Array.isArray(meta.standards)) problems.push("standards is not a list");
  return problems;
}

function tag(meta: HookMeta, kind: HookCategory): string {
  return `[omp-hook:${meta.id}:${kind}]`;
}

// Type-checkers reject the misuse; a hook loaded from JavaScript or cast data would not,
// so the same rule fails loudly at runtime and the suite proves it does.
function assertEffect(meta: HookMeta, effect: "block" | "content"): void {
  const declared = HOOK_CATEGORIES[meta.category].effect;
  if (declared !== effect) {
    throw new Error(`[omp-hook:${meta.id}] category ${meta.category} cannot emit a ${effect} return`);
  }
}

/** Point the agent at a rule before it can break it. The call still runs. */
export function advisory(meta: HookMeta, note: string): Verdict {
  return { additionalContext: `${tag(meta, "ADVISORY")} ${note}` };
}

/** Flag a call that is legal but almost always wrong. The call still runs. */
export function warn(meta: HookMeta, note: string): Verdict {
  return { additionalContext: `${tag(meta, "WARN")} ⚠ ${note}` };
}

/** Refuse input that cannot succeed, and name the call that can. */
export function error(meta: BlockingMeta, reason: string, fix: string): Verdict {
  assertEffect(meta, "block");
  return { block: true, reason: `${tag(meta, "ERROR")} ${reason} Fix: ${fix}` };
}

/** Refuse an action that risks data or safety. No automatic retry. */
export function block(meta: BlockingMeta, reason: string): Verdict {
  assertEffect(meta, "block");
  return { block: true, reason: `${tag(meta, "BLOCK")} ${reason}` };
}

/** Replace tool output before the model sees it. */
export function sanitized(meta: SanitizingMeta, content: unknown[], details?: unknown): ContentPatch {
  assertEffect(meta, "content");
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

export function resetOnSessionChange(pi: EventSource, ...trackers: Resettable[]): void {
  const reset = (): void => {
    for (const tracker of trackers) tracker.reset();
  };
  pi.on("session_start", reset);
  pi.on("session_clear", reset);
}

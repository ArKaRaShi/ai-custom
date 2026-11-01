import type { Result } from "@/scripts/domain/plan";

const CANONICAL_OPERATION: Record<string, string> = {
  scan: "status",
  review: "resolve",
  combine: "merge",
  backup: "push",
  save: "push",
  restore: "bootstrap",
};

/** Maps a command alias to the operation name reported in result envelopes. */
export function canonicalOperation(command: string): string {
  return Object.hasOwn(CANONICAL_OPERATION, command)
    ? (CANONICAL_OPERATION[command] as string)
    : command;
}

/** A result that should make the process exit non-zero. */
export function hasProblem(result: Result): boolean {
  return result.outcome === "failed" || result.outcome === "partial" || result.errors.length > 0;
}

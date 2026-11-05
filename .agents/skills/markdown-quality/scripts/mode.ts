/** Review modes: the mode names who reads the document. */
export type Mode = "agent" | "human";

/**
 * Parses a `--mode` value. `ai` is the deprecated name of `agent` and maps to it.
 * Returns null for any other value.
 */
export function parseMode(value: string): { mode: Mode; deprecatedAlias: boolean } | null {
  if (value === "agent" || value === "human") return { mode: value, deprecatedAlias: false };
  if (value === "ai") return { mode: "agent", deprecatedAlias: true };
  return null;
}

export const MODE_ALIAS_NOTICE = "--mode=ai is deprecated: use --mode=agent.";

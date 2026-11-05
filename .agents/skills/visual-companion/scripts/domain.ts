/** Domain model: screens, presentation mode, and the events a screen produces. */

export type Mode = "bundle" | "plain";

export interface Screen {
  screenId: number;
  file: string;
  title: string;
  mode: Mode;
  pushedAt: number;
  isolated?: boolean;
}

export const MAX_CHOICE_LENGTH = 200;
export const MAX_TEXT_LENGTH = 500;

export interface ChoiceEvent {
  type: "choice";
  choice: string;
  text: string;
  channel: "ws" | "http" | "form";
  at: number;
}

/** A whole document we must not restyle; everything else is our fragment. */
export function detectMode(html: string): Mode {
  return /^\s*(<!doctype\s+html|<html[\s>])/i.test(html) ? "plain" : "bundle";
}

function clean(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > limit) return null;
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001f\u007f]/.test(trimmed) ? null : trimmed;
}

/**
 * Untrusted client input becomes a ChoiceEvent or nothing. Everything else is
 * dropped here so nothing unvalidated reaches the ledger.
 */
export function parseChoiceEvent(
  input: unknown,
  channel: ChoiceEvent["channel"],
  now: number,
): ChoiceEvent | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as Record<string, unknown>;
  if (raw.type !== "choice" && raw.type !== "click") return null;
  const choice = clean(raw.choice, MAX_CHOICE_LENGTH);
  if (!choice) return null;
  const text = clean(raw.text, MAX_TEXT_LENGTH) ?? "";
  return { type: "choice", choice, text, channel, at: now };
}

export function parseEventJson(
  raw: string,
  channel: ChoiceEvent["channel"],
  now: number,
): ChoiceEvent | null {
  try {
    return parseChoiceEvent(JSON.parse(raw), channel, now);
  } catch {
    return null;
  }
}

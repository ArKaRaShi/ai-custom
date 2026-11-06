/*
 * Helpers shared by the behaviour components. Import-safe: nothing here touches
 * `document` or `window` at import time.
 */

/**
 * @param {string | null} value
 * @param {number} fallback
 * @returns {number}
 */
export function numberOr(value, fallback) {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function escapeText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Authored state crosses into the components here, once. Invalid or nested data reads as no state.
 * @param {string | null} raw the `data-state` attribute value
 * @returns {Record<string, string> | null}
 */
export function readFlatState(raw) {
  if (raw === null) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const state = {};
  for (const key of Object.keys(parsed)) {
    const value = parsed[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      state[key] = String(value);
    }
  }
  return Object.keys(state).length > 0 ? state : null;
}

/**
 * Return the presentation state after a peek interaction.
 * @param {boolean} current
 * @param {"enter" | "leave" | "focus" | "blur" | "escape"} event
 * @param {boolean} peekOnFocus
 * @returns {boolean}
 */
export function nextPeek(current, event, peekOnFocus) {
  if (event === "enter") return true;
  if (event === "leave" || event === "escape") return false;
  if (event === "focus") return peekOnFocus ? true : current;
  if (event === "blur") return peekOnFocus ? false : current;
  return current;
}

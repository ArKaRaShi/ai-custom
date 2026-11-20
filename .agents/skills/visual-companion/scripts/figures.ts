/**
 * Builds the figures that need arithmetic, so positions and counts are computed, not typed.
 *   bun scripts/figures.ts range --min 30 --max 100 --lo 64.7 --hi 78.4 [--at 74] [--unit " %"] [--digits 1] [--name "Expected range"]
 *   bun scripts/figures.ts waffle <percent> [--cells 100] [--cols 20]
 *   bun scripts/figures.ts replay <events.json>
 * Prints the markup for ui-range, ui-waffle or ui-replay (see assets/ui/components.json). A value outside the axis is drawn at the nearest edge;
 * its label still shows the true value. A replay's ticks are evenly spaced: the axis shows order, not duration.
 */
import { readFileSync } from "node:fs";
import { esc } from "./trace.ts";

export type RangeSpec = { min: number; max: number; lo: number; hi: number; at?: number; unit: string; digits: number; name: string };

/** Position along the axis as a percentage with two decimals, trailing zeros dropped. A value outside the axis lands on the nearest edge. */
function position(v: number, min: number, max: number): string {
  const percent = Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
  return String(Number(percent.toFixed(2)));
}

export function range(spec: RangeSpec): string {
  const { min, max, lo, hi, at, unit, digits, name } = spec;
  if (!(min < max)) throw new Error("--min must be less than --max");
  if (lo > hi) throw new Error("--lo must not be greater than --hi");
  const vars = [`--lo:${position(lo, min, max)}`, `--hi:${position(hi, min, max)}`, ...(at === undefined ? [] : [`--at:${position(at, min, max)}`])].join(";");
  const text = (v: number): string => v.toFixed(digits);
  const label = `${name} ${text(lo)} to ${text(hi)}${unit}${at === undefined ? "" : `, marker at ${text(at)}${unit}`}`;
  const pin = at === undefined ? "" : `<i class="ui-range-pin" data-label="${esc(text(at) + unit)}"></i>`;
  return `<div class="ui-range" style="${vars}" role="img" aria-label="${esc(label)}"><div class="ui-range-bar"><i class="ui-range-span"></i>${pin}</div><span class="ui-range-lo">${text(lo)}</span><span class="ui-range-hi">${text(hi)}</span></div>`;
}

export function waffle(percent: number, cells: number, cols: number): string {
  if (!(percent >= 0 && percent <= 100)) throw new Error("percent must be between 0 and 100");
  if (!Number.isInteger(cells) || cells < 1 || cells > 400) throw new Error("--cells must be a whole number from 1 to 400");
  if (!Number.isInteger(cols) || cols < 1 || cols > cells) throw new Error("--cols must be a whole number from 1 to --cells");
  const filled = Math.round((percent / 100) * cells);
  const grid = Array.from({ length: cells }, (_, i) => (i < filled ? '<i class="on"></i>' : "<i></i>")).join("");
  return `<div class="ui-waffle" style="--cols:${cols}" role="img" aria-label="${filled} of ${cells} cells filled (${percent}%)">${grid}</div>`;
}

export type ReplayEvent = { time: string; title: string; because: string; state?: string };
export type ReplaySpec = { label?: string; stateLabel: string; events: ReplayEvent[] };

/** Checks a hand-written events file as it is read; the rest of the builder can then trust the shape. */
export function parseReplaySpec(raw: unknown): ReplaySpec {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("the events file must be a JSON object");
  const obj = raw as Record<string, unknown>;
  const events = obj.events;
  if (!Array.isArray(events) || events.length < 2) throw new Error("events must be a list of at least 2 events");
  const text = (v: unknown, where: string): string => {
    if (typeof v !== "string" || v.trim() === "") throw new Error(`${where} must be a non-empty string`);
    return v;
  };
  const parsed = events.map((e: unknown, i): ReplayEvent => {
    if (typeof e !== "object" || e === null) throw new Error(`events[${i}] must be an object`);
    const ev = e as Record<string, unknown>;
    const state = ev.state === undefined ? undefined : text(ev.state, `events[${i}].state`);
    return { time: text(ev.time, `events[${i}].time`), title: text(ev.title, `events[${i}].title`), because: text(ev.because, `events[${i}].because`), state };
  });
  const label = obj.label === undefined ? undefined : text(obj.label, "label");
  const stateLabel = obj.stateLabel === undefined ? "State after" : text(obj.stateLabel, "stateLabel");
  return { label, stateLabel, events: parsed };
}

/** A ui-replay: an axis of numbered ticks, evenly spaced, then one section per event. Opens on the last event. */
export function replay(spec: ReplaySpec): string {
  const n = spec.events.length;
  const label = spec.label ?? `${n} events in order, not to scale`;
  const ticks = spec.events.map((_, i) => `<i class="done" style="--p:${position(i, 0, n - 1)}">${i + 1}</i>`).join("");
  const sections = spec.events
    .map((e, i) => {
      const state = e.state === undefined ? "" : `<small data-label="${esc(spec.stateLabel)}">${esc(e.state)}</small>`;
      return `<section><header><h3 data-n="${i + 1}">${esc(e.title)}</h3><b>${esc(e.time)}</b></header><p>${esc(e.because)}</p>${state}</section>`;
    })
    .join("");
  return `<div class="ui-replay"><div class="ui-replay-axis" role="img" aria-label="${esc(label)}">${ticks}<b class="ui-replay-marker"></b></div>${sections}</div>`;
}

/** Splits `--name value` pairs from positional arguments. A flag without a value is an error. */
function parseArgs(argv: string[]): { flags: Map<string, string>; positional: string[] } {
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) { positional.push(arg); continue; }
    const value = argv[++i];
    if (value === undefined) throw new Error(`${arg} needs a value`);
    flags.set(arg.slice(2), value);
  }
  return { flags, positional };
}

function num(flags: Map<string, string>, key: string, fallback?: number): number {
  const raw = flags.get(key);
  if (raw === undefined) {
    if (fallback === undefined) throw new Error(`--${key} is required`);
    return fallback;
  }
  const v = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(v)) throw new Error(`--${key} must be a number, got "${raw}"`);
  return v;
}

function main(argv: string[]): number {
  const [cmd, ...rest] = argv;
  try {
    const { flags, positional } = parseArgs(rest);
    if (cmd === "range") {
      const digits = num(flags, "digits", 1);
      if (!Number.isInteger(digits) || digits < 0 || digits > 6) throw new Error("--digits must be a whole number from 0 to 6");
      const min = num(flags, "min");
      const max = num(flags, "max");
      const lo = num(flags, "lo");
      const hi = num(flags, "hi");
      const at = flags.has("at") ? num(flags, "at") : undefined;
      const unit = flags.get("unit") ?? "";
      const name = flags.get("name") ?? "Range";
      const html = range({ min, max, lo, hi, at, unit, digits, name });
      console.log(html);
      return 0;
    }
    if (cmd === "waffle") {
      if (positional.length !== 1) throw new Error("waffle needs one percent");
      const raw = positional[0]!;
      const percent = Number(raw);
      if (raw.trim() === "" || !Number.isFinite(percent)) throw new Error(`percent must be a number, got "${raw}"`);
      const cells = num(flags, "cells", 100);
      const cols = num(flags, "cols", 20);
      const html = waffle(percent, cells, cols);
      console.log(html);
      return 0;
    }
    if (cmd === "replay") {
      if (positional.length !== 1) throw new Error("replay needs one events file");
      const source = readFileSync(positional[0]!, "utf8");
      const raw: unknown = JSON.parse(source);
      const spec = parseReplaySpec(raw);
      const html = replay(spec);
      console.log(html);
      return 0;
    }
    console.error('usage: figures.ts range --min N --max N --lo N --hi N [--at N] [--unit " %"] [--digits 1] [--name "Expected range"] | waffle <percent> [--cells 100] [--cols 20] | replay <events.json>');
    return 2;
  } catch (e) {
    console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const code = main(args);
  process.exit(code);
}

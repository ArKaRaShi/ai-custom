/**
 * Builds page.html from page.tpl.html.
 *
 * Every number in the static page comes from running reference.py or from the figure builders in scripts/figures.ts. The formula
 * constants and the tone cut-offs are not typed into the text: the constants are probed from the reference code, and the cut-offs are
 * checked against it, so the build stops if the reference and the page disagree. The result is made standalone with scripts/inline-ui.ts and
 * model.js is inlined, so the file opens with no server.
 *
 *   bun build.ts [out.html]     default: page.html next to this file
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { range, waffle } from "../../scripts/figures.ts";

type Tone = "critical" | "warning" | "normal" | "no_data";
type Result = { lo: number | null; hi: number | null; score: number | null; tone: Tone };
type Input = { size: number; reading: number | null };
type Bounds = { lo: number; hi: number };
type Coefficients = { a: number; b: number; c: number; d: number };
type Step = { result: string; numbers: string };

const DIR = import.meta.dir;
const SKILL = join(DIR, "..", "..");
const modelPath = join(DIR, "model.js");
const templatePath = join(DIR, "page.tpl.html");
const SIZE_AXIS = { min: 1, max: 1000 };
const READING_AXIS = { min: 30, max: 100 };
const CELLS = 100;
const COLS = 20;
const CUTS = { critical: 50, warning: 75 };
const START: Input = { size: 75, reading: 74 };
const PRESETS: Input[] = [
  { size: 30, reading: 55.5 },
  START,
  { size: 160, reading: 80.5 },
  { size: 55, reading: null },
];
const WORD: Record<Tone, string> = { critical: "Critical", warning: "Warning", normal: "Normal", no_data: "No data" };
const GLYPH: Record<Tone, string> = { critical: "▲", warning: "◆", normal: "●", no_data: "◌" };
const MODIFIER: Record<Tone, string> = { critical: "critical", warning: "warning", normal: "normal", no_data: "nodata" };

/** Runs the reference code for one input. */
async function reference(input: Input): Promise<Result> {
  const reading = input.reading === null ? "none" : String(input.reading);
  const script = join(DIR, "reference.py");
  const proc = Bun.spawn(["python3", script, String(input.size), reading], { stdout: "pipe", stderr: "pipe" });
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  const code = await proc.exited;
  if (code !== 0) throw new Error(`reference.py failed for ${input.size}, ${reading}: ${err.trim()}`);
  return JSON.parse(out) as Result;
}

function bounds(m: Result): Bounds {
  if (m.lo === null || m.hi === null) throw new Error("the reference code returned no band");
  return { lo: m.lo, hi: m.hi };
}

/** low = a + b × ln(P) and high = c + d × ln(P): ln(1) = 0 gives the intercepts, ln(e) = 1 adds the slopes. */
async function coefficients(): Promise<Coefficients> {
  const one = await reference({ size: 1, reading: null });
  const e = await reference({ size: Math.E, reading: null });
  const atOne = bounds(one);
  const atE = bounds(e);
  return { a: atOne.lo, b: atE.lo - atOne.lo, c: atOne.hi, d: atE.hi - atOne.hi };
}

/** The cut-offs typed above must be the ones the reference code uses: a score a hair either side of each flips the tone. */
async function checkCuts(): Promise<void> {
  const base = await reference({ size: START.size, reading: null });
  const { lo, hi } = bounds(base);
  const probes: [number, Tone][] = [
    [CUTS.critical - 0.01, "critical"],
    [CUTS.critical + 0.01, "warning"],
    [CUTS.warning - 0.01, "warning"],
    [CUTS.warning + 0.01, "normal"],
  ];
  for (const [score, expected] of probes) {
    const reading = lo + (score / 100) * (hi - lo);
    const got = await reference({ size: START.size, reading });
    if (got.tone !== expected) throw new Error(`score ${score} should be ${expected} but the reference code says ${got.tone}`);
  }
}

/** The numbers the page shows are the numbers it used: the formula applied to the input must give the reference result. */
function checkFormula(input: Input, m: Result, k: Coefficients): void {
  if (m.lo === null || m.hi === null) throw new Error(`no band for ${input.size} kW`);
  const log = Math.log(input.size);
  const lo = k.a + k.b * log;
  const hi = k.c + k.d * log;
  if (Math.abs(lo - m.lo) > 1e-9 || Math.abs(hi - m.hi) > 1e-9) throw new Error(`the formula and the reference code disagree on the band at ${input.size} kW`);
  if (input.reading === null) return;
  const raw = ((input.reading - m.lo) / (m.hi - m.lo)) * 100;
  const capped = Math.min(100, raw);
  const clamped = Math.max(0, capped);
  if (m.score === null || Math.abs(clamped - m.score) > 1e-9) throw new Error(`the formula and the reference code disagree on the score at ${input.size} kW, ${input.reading} %`);
}

const f1 = (v: number): string => v.toFixed(1);
const f3 = (v: number): string => v.toFixed(3);
const f4 = (v: number): string => v.toFixed(4);
const f6 = (v: number): string => v.toFixed(6);
const coef = (v: number): string => String(Number(v.toFixed(6)));
const ref = (text: string, to: string, what: string): string => `<a class="ui-ref" href="#${to}" aria-label="${text}, ${what}">${text}</a>`;

/** The words and numbers for one input. The page script's describe() builds the same strings in the browser. */
function describe(input: Input, m: Result, k: Coefficients): { headline: string; steps: Step[] } {
  const { size, reading } = input;
  const tone = WORD[m.tone].toLowerCase();
  let headline: string;
  let band: Step;
  let place: Step;
  if (m.lo === null || m.hi === null) {
    headline = `A machine of ${size} kW has no expected band, so it has no score`;
    band = { result: "none", numbers: "The size must be above 0 for a band to exist." };
    place = { result: "no score", numbers: "Without a band there is nothing to place the reading in." };
  } else {
    const log = Math.log(size);
    band = {
      result: `${f1(m.lo)} to ${f1(m.hi)} %`,
      numbers: `ln(${size}) = ${f6(log)}\n<span id="ln-low">low = ${coef(k.a)} + ${coef(k.b)} × ${f6(log)} ≈ ${f4(m.lo)}</span>\n<span id="ln-high">high = ${coef(k.c)} + ${coef(k.d)} × ${f6(log)} ≈ ${f4(m.hi)}</span>`,
    };
    if (reading === null || m.score === null) {
      headline = `A ${size} kW machine with no reading has no score`;
      place = { result: "no score", numbers: "There is no reading, so there is nothing to place." };
    } else {
      headline = `A ${size} kW machine reading ${reading} % scores <em>${f1(m.score)}</em>: ${tone}`;
      const raw = ((reading - m.lo) / (m.hi - m.lo)) * 100;
      const low = ref(f4(m.lo), "ln-low", "the low end from step 2");
      const high = ref(f4(m.hi), "ln-high", "the high end from step 2");
      const kept = raw < 0 || raw > 100 ? `\nkept in 0 to 100 → ${f1(m.score)}` : "";
      place = {
        result: f1(m.score),
        numbers: `(${ref(String(reading), "reading-n", "your reading")} − ${low}) ÷ (${high} − ${low}) × 100 ≈ ${f3(raw)}${kept}`,
      };
    }
  }
  const score = m.score === null ? "" : f3(m.score);
  const rule: Record<Tone, string> = {
    critical: `${score} ≤ ${CUTS.critical} → critical`,
    warning: `${score} &gt; ${CUTS.critical} and ≤ ${CUTS.warning} → warning`,
    normal: `${score} &gt; ${CUTS.warning} → normal`,
    no_data: "no score → no data",
  };
  const steps: Step[] = [{ result: `${size} kW`, numbers: `size_kw = ${size}` }, band, place, { result: tone, numbers: rule[m.tone] }];
  return { headline, steps };
}

function status(tone: Tone, id: string): string {
  const attr = id === "" ? "" : ` id="${id}"`;
  return `<span class="ui-status ${MODIFIER[tone]}"${attr}><i aria-hidden="true">${GLYPH[tone]}</i>${WORD[tone]}</span>`;
}

function caseCard(input: Input, m: Result): string {
  const given = input.reading === null ? "no reading" : `${input.reading} %`;
  const data = input.reading === null ? "" : String(input.reading);
  const pressed = input.size === START.size && input.reading === START.reading;
  const score = m.score === null ? "—" : f1(m.score);
  return `<button type="button" class="ui-case" data-size="${input.size}" data-reading="${data}" aria-pressed="${pressed}"><small>${input.size} kW, ${given}</small><b>${score}</b>${status(m.tone, "")}</button>`;
}

/** Position of a size on the slider: 0 to 100 along a log scale from the smallest to the largest size. */
function sizePosition(size: number): string {
  const along = Math.log(size / SIZE_AXIS.min) / Math.log(SIZE_AXIS.max / SIZE_AXIS.min);
  return String(Number((along * 100).toFixed(2)));
}

/** Replaces each @@NAME@@ with its value and refuses to leave one behind. */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/@@(\w+)@@/g, (_, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`the template has a placeholder @@${name}@@ that build.ts does not fill`);
    return value;
  });
}

export async function build(outPath: string): Promise<void> {
  const k = await coefficients();
  await checkCuts();
  const m = await reference(START);
  checkFormula(START, m, k);
  const results = await Promise.all(PRESETS.map(reference));
  PRESETS.forEach((input, i) => checkFormula(input, results[i], k));
  if (START.reading === null || m.lo === null || m.hi === null || m.score === null) throw new Error("the start case needs a reading and a band");

  const text = describe(START, m, k);
  const model = await readFile(modelPath, "utf8");
  const values: Record<string, string> = {
    HEADLINE: text.headline,
    SCORE: f1(m.score),
    STATUS: status(m.tone, "status"),
    RANGE: range({ min: READING_AXIS.min, max: READING_AXIS.max, lo: m.lo, hi: m.hi, at: START.reading, unit: " %", digits: 1, name: "Expected band" }),
    WAFFLE: waffle(START.reading, CELLS, COLS),
    CASES: results.map((r, i) => caseCard(PRESETS[i], r)).join(""),
    SIZE: String(START.size),
    READING: String(START.reading),
    SIZEPOS: sizePosition(START.size),
    SIZEMIN: String(SIZE_AXIS.min),
    SIZEMAX: String(SIZE_AXIS.max),
    AXMIN: String(READING_AXIS.min),
    AXMAX: String(READING_AXIS.max),
    CUTS: JSON.stringify(CUTS),
    F1: `low  = ${coef(k.a)} + ${coef(k.b)} × ln(P)\nhigh = ${coef(k.c)} + ${coef(k.d)} × ln(P)\nP = the size in kW, ln = natural logarithm`,
    F3: `score ≤ ${CUTS.critical} → critical\nscore ≤ ${CUTS.warning} → warning\notherwise → normal`,
    MODEL: model,
  };
  text.steps.forEach((step, i) => {
    values[`R${i}`] = step.result;
    values[`N${i}`] = step.numbers;
  });

  const template = await readFile(templatePath, "utf8");
  const linked = fill(template, values);
  const tmp = tmpdir();
  const prefix = join(tmp, "band-page-");
  const work = await mkdtemp(prefix);
  try {
    const source = join(work, "linked.html");
    await writeFile(source, linked);
    const inline = join(SKILL, "scripts", "inline-ui.ts");
    const proc = Bun.spawn(["bun", inline, source, outPath], { stdout: "ignore", stderr: "pipe" });
    const err = await new Response(proc.stderr).text();
    const code = await proc.exited;
    if (code !== 0) throw new Error(`inline-ui.ts failed: ${err.trim()}`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const out = process.argv[2] ?? join(DIR, "page.html");
  await build(out);
  console.log(`wrote ${out}`);
}

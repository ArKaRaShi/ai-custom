/**
 * Checks that the formula a page runs gives the same answers as the real code, at points you choose.
 *   bun scripts/model-check.ts <spec.json>
 * Spec (JSON, paths relative to the spec's folder):
 *   model      a script that defines the formula with no DOM and sets globalThis[global]
 *   global     the name that script sets; it must be a function that takes the inputs and returns an object
 *   command    a shell command that prints one JSON object for an input; {0}, {1}, ... become the input values, and null becomes the word none
 *   fields     the keys to compare
 *   inputs     the points to compare, each a list of numbers or null
 *   tolerance  largest allowed difference between two numbers (default 1e-9)
 * Numbers must agree within the tolerance; everything else (strings, null) must be equal. Exit 0 when every point agrees, 1 otherwise.
 * Commands run through `sh -c` in the spec's folder with the same trust as any command you write.
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type Value = number | null;
export type Spec = { model: string; global: string; command: string; fields: string[]; inputs: Value[][]; tolerance: number };
export type Mismatch = { input: Value[]; field: string; expected: unknown; actual: unknown };
export type Result = { points: number; largestDifference: number; mismatches: Mismatch[] };
type Model = (...input: Value[]) => Record<string, unknown>;

const BATCH = 8;
const TIMEOUT_SECONDS = 30;

/** The one guard this file needs: the spec is hand-written JSON, so every field is checked as it is read. */
export function parseSpec(raw: unknown): Spec {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("the spec must be a JSON object");
  const obj = raw as Record<string, unknown>;
  const text = (key: string): string => {
    const v = obj[key];
    if (typeof v !== "string" || v.trim() === "") throw new Error(`${key} must be a non-empty string`);
    return v;
  };
  const fields = obj.fields;
  if (!Array.isArray(fields) || fields.length === 0 || !fields.every((f) => typeof f === "string" && f !== "")) throw new Error("fields must be a non-empty list of names");
  const inputs = obj.inputs;
  if (!Array.isArray(inputs) || inputs.length === 0) throw new Error("inputs must be a non-empty list");
  const points = inputs.map((point, i): Value[] => {
    if (!Array.isArray(point) || !point.every((v) => v === null || (typeof v === "number" && Number.isFinite(v)))) throw new Error(`inputs[${i}] must be a list of numbers or null`);
    return point as Value[];
  });
  const tolerance = obj.tolerance ?? 1e-9;
  if (typeof tolerance !== "number" || !(tolerance >= 0)) throw new Error("tolerance must be a number of at least 0");
  const command = text("command");
  const lengths = points.map((p) => p.length);
  const widest = Math.min(...lengths);
  for (const m of command.matchAll(/\{(\d+)\}/g)) if (Number(m[1]) >= widest) throw new Error(`command uses {${m[1]}} but an input has only ${widest} values`);
  const model = text("model");
  const global = text("global");
  return { model, global, command, fields: fields as string[], inputs: points, tolerance };
}

async function loadModel(spec: Spec, dir: string): Promise<Model> {
  const file = resolve(dir, spec.model);
  const url = `${pathToFileURL(file).href}?run=${performance.now()}`;
  // A stale global from an earlier check must not satisfy this one, and a changed model file must be read again.
  Reflect.deleteProperty(globalThis, spec.global);
  // The model file is named by the spec, so the module is chosen at run time and cannot be a static import.
  await import(url);
  const model: unknown = Reflect.get(globalThis, spec.global);
  if (typeof model !== "function") throw new Error(`${spec.model} did not set globalThis.${spec.global} to a function`);
  return model as Model;
}

async function runReference(spec: Spec, input: Value[], dir: string): Promise<Record<string, unknown>> {
  const command = spec.command.replace(/\{(\d+)\}/g, (_, i: string) => {
    const v = input[Number(i)];
    return v === null || v === undefined ? "none" : String(v);
  });
  const proc = Bun.spawn(["sh", "-c", command], { cwd: dir, stdout: "pipe", stderr: "pipe", timeout: TIMEOUT_SECONDS * 1000 });
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  const code = await proc.exited;
  if (code !== 0) throw new Error(`\`${command}\` exited ${code}${err.trim() === "" ? "" : `: ${err.trim()}`}`);
  const parsed: unknown = JSON.parse(out);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(`\`${command}\` must print one JSON object`);
  return parsed as Record<string, unknown>;
}

/** The size of the disagreement between two values: 0 when equal, Infinity when they differ and are not both numbers. */
function difference(expected: unknown, actual: unknown): number {
  if (typeof expected === "number" && typeof actual === "number") return Math.abs(expected - actual);
  return expected === actual ? 0 : Infinity;
}

export async function checkModel(spec: Spec, dir: string): Promise<Result> {
  const model = await loadModel(spec, dir);
  const mismatches: Mismatch[] = [];
  let largestDifference = 0;
  for (let start = 0; start < spec.inputs.length; start += BATCH) {
    const batch = spec.inputs.slice(start, start + BATCH);
    const runs = batch.map((input) => runReference(spec, input, dir));
    const references = await Promise.all(runs);
    batch.forEach((input, i) => {
      const actual = model(...input);
      for (const field of spec.fields) {
        const expected = references[i]![field];
        const gap = difference(expected, actual[field]);
        if (Number.isFinite(gap)) largestDifference = Math.max(largestDifference, gap);
        if (gap > spec.tolerance) mismatches.push({ input, field, expected, actual: actual[field] });
      }
    });
  }
  return { points: spec.inputs.length, largestDifference, mismatches };
}

async function main(argv: string[]): Promise<number> {
  const [file] = argv;
  if (!file) {
    console.error("usage: model-check.ts <spec.json>");
    return 2;
  }
  try {
    const source = await readFile(file, "utf8");
    const raw: unknown = JSON.parse(source);
    const spec = parseSpec(raw);
    const dir = dirname(resolve(file));
    const result = await checkModel(spec, dir);
    if (result.mismatches.length === 0) {
      console.log(`ok: ${result.points} points, ${spec.fields.length} fields each, largest difference ${result.largestDifference}`);
      return 0;
    }
    for (const m of result.mismatches.slice(0, 5)) console.log(`mismatch at [${m.input.join(", ")}] ${m.field}: reference ${JSON.stringify(m.expected)}, page ${JSON.stringify(m.actual)}`);
    console.log(`${result.mismatches.length} mismatch(es) in ${result.points} points`);
    return 1;
  } catch (e) {
    console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const code = await main(args);
  process.exit(code);
}

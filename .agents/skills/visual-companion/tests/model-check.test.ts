import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkModel, parseSpec } from "../scripts/model-check.ts";

/** A temporary folder holding a model file that sets globalThis[name] to the given function source. */
async function withModel<T>(name: string, source: string, run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "vc-model-"));
  try {
    await writeFile(join(dir, "model.js"), `globalThis.${name} = ${source};`);
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const doubling = (extra: string) => parseSpec({
  model: "model.js",
  global: "twice",
  command: "printf '{\"score\": %s}' $(( {0} * 2 ))",
  fields: ["score"],
  inputs: [[1], [5], [40]],
  ...(extra === "" ? {} : { tolerance: Number(extra) }),
});

test("a page formula that matches the reference at every point passes", async () => {
  const spec = doubling("");
  const result = await withModel("twice", "(x) => ({ score: x * 2 })", (dir) => checkModel(spec, dir));
  expect(result.mismatches).toEqual([]);
  expect(result.points).toBe(3);
  expect(result.largestDifference).toBe(0);
});

test("a formula that drifts from the reference is reported with the input and both values", async () => {
  const spec = doubling("");
  const result = await withModel("twice", "(x) => ({ score: x === 5 ? 10.5 : x * 2 })", (dir) => checkModel(spec, dir));
  expect(result.mismatches).toEqual([{ input: [5], field: "score", expected: 10, actual: 10.5 }]);
  expect(result.largestDifference).toBe(0.5);
});

test("a difference inside the tolerance is accepted", async () => {
  const spec = doubling("0.01");
  const result = await withModel("twice", "(x) => ({ score: x * 2 + 0.005 })", (dir) => checkModel(spec, dir));
  expect(result.mismatches).toEqual([]);
});

test("null is sent to the reference as the word none and compared as null", async () => {
  const spec = parseSpec({ model: "model.js", global: "maybe", command: "printf '{\"score\": null, \"tone\": \"%s\"}' {0}", fields: ["score", "tone"], inputs: [[null]] });
  const wrongTone = await withModel("maybe", "(x) => ({ score: null, tone: 'other' })", (dir) => checkModel(spec, dir));
  expect(wrongTone.mismatches.map((m) => m.field)).toEqual(["tone"]);
  const right = await withModel("maybe", "(x) => ({ score: null, tone: x === null ? 'none' : 'other' })", (dir) => checkModel(spec, dir));
  expect(right.mismatches).toEqual([]);
});

test("a model file that does not define the named function is an error", async () => {
  const spec = doubling("");
  await expect(withModel("other", "() => ({})", (dir) => checkModel(spec, dir))).rejects.toThrow("globalThis.twice");
});

test("a failing reference command is an error that shows the command", async () => {
  const spec = parseSpec({ model: "model.js", global: "twice", command: "exit 3 # {0}", fields: ["score"], inputs: [[1]] });
  await expect(withModel("twice", "(x) => ({ score: x })", (dir) => checkModel(spec, dir))).rejects.toThrow("exited 3");
});

test("a spec that cannot be run is refused before anything executes", () => {
  expect(() => parseSpec({ model: "m.js", global: "g", command: "echo {2}", fields: ["a"], inputs: [[1]] })).toThrow("{2}");
  expect(() => parseSpec({ model: "m.js", global: "g", command: "echo", fields: [], inputs: [[1]] })).toThrow("fields");
  expect(() => parseSpec({ model: "m.js", global: "g", command: "echo", fields: ["a"], inputs: [["x"]] })).toThrow("inputs[0]");
  expect(() => parseSpec([])).toThrow("JSON object");
});

test("the band-score example agrees with its reference code", async () => {
  const specUrl = new URL("../examples/band-score/spec.json", import.meta.url);
  const spec = parseSpec(await Bun.file(specUrl).json());
  const result = await checkModel(spec, dirname(specUrl.pathname));
  expect(result.mismatches).toEqual([]);
  expect(result.points).toBeGreaterThan(20);
});

/**
 * The one evaluator for derivations: the CLI runs it at the starting inputs before publishing,
 * and the renderer runs it on every input change, so the two cannot disagree.
 */
import { all, ConstantNode, create, type MathNode, type Unit } from "mathjs";
import type { InputSpec, StepSpec } from "./catalog";

// mathjs types `all` as optional, but the package always exports it.
if (!all) throw new Error("mathjs did not export its function set");
const math = create(all);

/**
 * Functions a formula may call. Spec text is evaluated in the CLI and the reader's tab, so anything that
 * changes mathjs itself (config, createUnit, import), re-enters the parser (evaluate, parse, simplify),
 * or builds large structures (matrices, ranges, random) is out of reach.
 */
const SAFE_FUNCTIONS = new Set([
  ...["abs", "sign", "sqrt", "cbrt", "nthRoot", "exp", "expm1", "log", "log10", "log2", "log1p", "pow", "hypot"],
  ...["min", "max", "round", "floor", "ceil", "fix", "mod"],
  ...["sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sinh", "cosh", "tanh"],
]);
const SAFE_NODES = new Set(["ConstantNode", "SymbolNode", "OperatorNode", "ParenthesisNode", "ConditionalNode", "FunctionNode"]);

/** Rejects anything outside plain arithmetic over symbols, units and the allowed (plus already-defined) functions. */
function checkFormula(tree: MathNode, callable: ReadonlySet<string>): void {
  tree.traverse((node: MathNode) => {
    if (!SAFE_NODES.has(node.type)) throw new Error(`${node.type} is not allowed in a formula: ${node.toString()}`);
    if (math.isFunctionNode(node)) {
      const name = math.isSymbolNode(node.fn) ? node.fn.name : "";
      if (!SAFE_FUNCTIONS.has(name) && !callable.has(name)) throw new Error(`function ${name || node.fn.toString()} is not allowed in a formula`);
    }
  });
}

/** Parses `name(args) = body` definitions in order; a body may call only safe functions and earlier definitions, so no recursion. */
export function checkFunctions(definitions: string[]): { names: Set<string>; errors: { index: number; message: string }[] } {
  const names = new Set<string>();
  const errors: { index: number; message: string }[] = [];
  for (const [index, definition] of definitions.entries()) {
    try {
      const tree = math.parse(definition);
      if (!math.isFunctionAssignmentNode(tree)) throw new Error("write a function as name(args) = expression");
      if (SAFE_FUNCTIONS.has(tree.name) || names.has(tree.name)) throw new Error(`function ${tree.name} is already defined`);
      checkFormula(tree.expr, names);
      names.add(tree.name);
    } catch (error) {
      errors.push({ index, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { names, errors };
}

/** Error message for a step formula that is not plain arithmetic, or undefined when it is. */
export function checkStepFormula(expr: string, functionNames: ReadonlySet<string>): string | undefined {
  try {
    checkFormula(math.parse(expr), functionNames);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Everything a lesson's derivations depend on, in evaluation order. */
export interface Model {
  inputs: InputSpec[];
  functions: string[];
  steps: StepSpec[];
}

export type InputValues = Record<string, number>;

export interface StepResult {
  /** The result as a plain number, in the step's unit when it has one. */
  value: number;
  /** The raw mathjs result, kept so later steps and the Substitute line see units. */
  raw: unknown;
}

export class StepError extends Error {
  constructor(
    readonly stepId: string,
    message: string,
  ) {
    super(message);
  }
}

export function startValues(inputs: InputSpec[]): InputValues {
  return Object.fromEntries(inputs.map((input) => [input.key, input.value]));
}

/** Inputs enter formulas with their unit attached, so `P * 1e5` mistakes surface as unit errors. */
function inputScope(inputs: InputSpec[], values: InputValues): Map<string, unknown> {
  const scope = new Map<string, unknown>();
  for (const input of inputs) {
    const value = values[input.key] ?? input.value;
    scope.set(input.key, input.unit ? math.unit(value, input.unit) : value);
  }
  return scope;
}

/** Results of every step before the first failure, and that failure if any. */
export interface Run {
  results: Map<string, StepResult>;
  error: StepError | undefined;
}

/** Evaluates steps in order; each step's id joins the scope for the steps after it. Stops at the first failing step. */
export function evaluatePartial(model: Model, values: InputValues): Run {
  const scope = inputScope(model.inputs, values);
  const functions = checkFunctions(model.functions);
  const firstStep = model.steps[0]?.id ?? "";
  const badFunction = functions.errors[0];
  if (badFunction) return { results: new Map(), error: new StepError(firstStep, `functions[${badFunction.index}]: ${badFunction.message}`) };
  for (const definition of model.functions) math.evaluate(definition, scope);
  const results = new Map<string, StepResult>();
  for (const step of model.steps) {
    try {
      const unsafe = checkStepFormula(step.expr, functions.names);
      if (unsafe) throw new StepError(step.id, unsafe);
      const raw: unknown = math.evaluate(step.expr, scope);
      const value = toNumber(step, raw);
      scope.set(step.id, raw);
      results.set(step.id, { value, raw });
    } catch (error) {
      const failure = error instanceof StepError ? error : new StepError(step.id, error instanceof Error ? error.message : String(error));
      return { results, error: failure };
    }
  }
  return { results, error: undefined };
}

/** Like evaluatePartial, but every step must succeed. Throws StepError. */
export function evaluate(model: Model, values: InputValues): Map<string, StepResult> {
  const run = evaluatePartial(model, values);
  if (run.error) throw run.error;
  return run.results;
}

function toNumber(step: StepSpec, raw: unknown): number {
  if (math.isUnit(raw)) {
    if (!step.unit) throw new StepError(step.id, `result has a unit (${raw.formatUnits()}); set the step's unit`);
    let converted: number;
    try {
      converted = raw.toNumber(step.unit);
    } catch (error) {
      throw new StepError(step.id, error instanceof Error ? error.message : String(error));
    }
    if (!Number.isFinite(converted)) throw new StepError(step.id, `result is not a finite number: ${math.format(raw)}`);
    return converted;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (step.unit) throw new StepError(step.id, `result is a plain number but the step's unit is ${step.unit}`);
    return raw;
  }
  throw new StepError(step.id, `result is not a finite number: ${math.format(raw)}`);
}

/** Relative tolerance for the expect check: loose enough for float noise, tight enough to catch a wrong formula. */
export const EXPECT_TOLERANCE = 1e-6;

/** True when the step declares an expected value and the computed one disagrees beyond EXPECT_TOLERANCE. */
export function missesExpect(step: StepSpec, value: number): boolean {
  if (step.expect === undefined) return false;
  return Math.abs(value - step.expect) > EXPECT_TOLERANCE * Math.max(Math.abs(step.expect), Number.MIN_VALUE);
}

/** Values a step's Substitute line can show: inputs with their units, then each earlier step's raw result. */
export function knownBefore(model: Model, values: InputValues, results: Map<string, StepResult>, stepId: string): Map<string, unknown> {
  const known = inputScope(model.inputs, values);
  for (const step of model.steps) {
    if (step.id === stepId) break;
    const result = results.get(step.id);
    if (result) known.set(step.id, result.raw);
  }
  return known;
}

/** Display formula: the step's TeX, or the expression rendered as TeX. */
export function formulaTex(step: StepSpec): string {
  return step.tex ?? math.parse(step.expr).toTex({ parenthesis: "auto" });
}

/** The Substitute line as TeX: the expression with every known symbol replaced by its current value. */
export function substituteTex(step: StepSpec, known: Map<string, unknown>): string {
  const tree = math.parse(step.expr);
  const filled = tree.transform((node: MathNode) => {
    if (!math.isSymbolNode(node) || !known.has(node.name)) return node;
    const value = known.get(node.name);
    if (typeof value === "number") return new ConstantNode(round(value));
    if (math.isUnit(value)) return math.parse(formatUnit(value));
    return node;
  });
  return filled.toTex({ parenthesis: "auto", implicit: "hide" });
}

/** The Substitute line from the step's template: `{name}` becomes the current value of `name`. */
export function fillTemplate(template: string, known: Map<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (known.has(name) ? display(known.get(name)) : match));
}

export function display(value: unknown): string {
  if (typeof value === "number") return formatNumber(value);
  if (math.isUnit(value)) return formatUnit(value);
  return math.format(value);
}

export function formatNumber(value: number): string {
  return value.toLocaleString("en-US", { maximumSignificantDigits: 5 });
}

function round(value: number): number {
  return Number(value.toPrecision(5));
}

function formatUnit(value: Unit): string {
  return math.format(value, { precision: 5 });
}

/**
 * The lesson spec: the nested JSON an agent writes for an Explain page.
 * Validation and the published JSON Schema come from the shared prop catalog;
 * toRenderSpec turns a valid lesson into the flat element map json-render draws.
 */
import { z } from "zod";
import { AnswerProps, BLOCK_PROPS, Input, LessonProps, SectionProps, type StepSpec } from "./catalog";
import { evaluate, type Model, missesExpect, StepError, startValues } from "./evaluate";

const Block = z.discriminatedUnion("type", [
  BLOCK_PROPS.Concept.extend({ type: z.literal("Concept") }),
  BLOCK_PROPS.Playground.extend({ type: z.literal("Playground") }),
  BLOCK_PROPS.Derivation.extend({ type: z.literal("Derivation") }),
  BLOCK_PROPS.Quiz.extend({ type: z.literal("Quiz") }),
  BLOCK_PROPS.Evidence.extend({ type: z.literal("Evidence") }),
  BLOCK_PROPS.Compare.extend({ type: z.literal("Compare") }),
  BLOCK_PROPS.Chart.extend({ type: z.literal("Chart") }),
]);

const Section = SectionProps.extend({ blocks: z.array(Block).min(1) });

export const Lesson = LessonProps.extend({
  answer: AnswerProps.shape.text,
  inputs: z.array(Input).default([]).describe("Values the reader can change; formulas see them by key"),
  functions: z
    .array(z.string().regex(/^\s*[A-Za-z_]\w*\s*\([^)]*\)\s*=/, "write a function as name(args) = expression"))
    .default([])
    .describe("mathjs function definitions shared by every step, such as backoff(n) = min(30 s, 0.5 s * 2^n)"),
  sections: z.array(Section).min(1),
}).superRefine((lesson, ctx) => {
  const issue = (path: PropertyKey[], message: string) => ctx.addIssue({ code: "custom", path, message });
  const sectionIds = new Set<string>();
  lesson.sections.forEach((section, i) => {
    if (sectionIds.has(section.id)) issue(["sections", i, "id"], `duplicate section id "${section.id}"`);
    sectionIds.add(section.id);
  });
  const inputKeys = new Set<string>();
  lesson.inputs.forEach((input, i) => {
    if (inputKeys.has(input.key)) issue(["inputs", i, "key"], `duplicate input key "${input.key}"`);
    if (input.min > input.max || input.value < input.min || input.value > input.max) issue(["inputs", i, "value"], "value must lie between min and max");
    inputKeys.add(input.key);
  });
  const stepIds = new Set<string>();
  // The Playground sticks only within its own section, so derivations it drives must follow it there.
  let playground: { section: number; block: number } | undefined;
  for (const [s, section] of lesson.sections.entries()) {
    for (const [b, block] of section.blocks.entries()) {
      if (block.type === "Playground") {
        if (playground) issue(["sections", s, "blocks", b], "a lesson has at most one Playground");
        playground ??= { section: s, block: b };
        if (inputKeys.size === 0) issue(["sections", s, "blocks", b], "a Playground needs lesson inputs");
        block.presets.forEach((preset, p) => {
          for (const key of Object.keys(preset.set)) {
            if (!inputKeys.has(key)) issue(["sections", s, "blocks", b, "presets", p, "set", key], `no input named "${key}"`);
          }
        });
      }
      if (block.type === "Quiz" && block.answer >= block.options.length) {
        issue(["sections", s, "blocks", b, "answer"], `answer ${block.answer} is not one of the ${block.options.length} options (count from 0)`);
      }
      if (block.type === "Derivation") {
        block.steps.forEach((step, t) => {
          if (stepIds.has(step.id) || inputKeys.has(step.id)) issue(["sections", s, "blocks", b, "steps", t, "id"], `"${step.id}" is already an input or step`);
          stepIds.add(step.id);
        });
      }
    }
  }
  const anchor = playground;
  if (anchor) {
    for (const [s, section] of lesson.sections.entries()) {
      for (const [b, block] of section.blocks.entries()) {
        const after = s === anchor.section && b > anchor.block;
        if (block.type === "Derivation" && !after)
          issue(["sections", s, "blocks", b], "put this Derivation after the Playground, in the same section, so the inputs stay in view");
      }
    }
  }
});

export type LessonSpec = z.infer<typeof Lesson>;

/** json-render's flat spec: one entry per element, linked by child ids. */
export interface RenderSpec {
  root: string;
  elements: Record<string, { type: string; props: Record<string, unknown>; children: string[] }>;
  state: { model: Model; start: Record<string, number>; inputs: Record<string, number> };
}

export type ParseResult = { ok: true; lesson: LessonSpec } | { ok: false; errors: string[] };

/** Validates the shape, then evaluates every derivation at the starting inputs so a broken formula never publishes. */
export function parseLesson(raw: unknown): ParseResult {
  const result = Lesson.safeParse(raw);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => `${locate(raw, issue.path)}: ${issue.message}`);
    return { ok: false, errors };
  }
  const lesson = result.data;
  const model = lessonModel(lesson);
  let results: ReturnType<typeof evaluate>;
  try {
    results = evaluate(model, startValues(model.inputs));
  } catch (error) {
    if (!(error instanceof StepError)) throw error;
    const path = stepPath(lesson, error.stepId);
    return { ok: false, errors: [`${locate(raw, path)}: ${error.message}`] };
  }
  // Expect check: every declared value must match what the formula computes at the starting inputs.
  const mismatches: string[] = [];
  for (const step of model.steps) {
    const computed = results.get(step.id)?.value;
    if (computed === undefined || step.expect === undefined || !missesExpect(step, computed)) continue;
    const where = locate(raw, stepPath(lesson, step.id));
    mismatches.push(`${where}: expected ${step.expect}, computed ${computed}; the formula does not match the real code`);
  }
  if (mismatches.length) return { ok: false, errors: mismatches };
  return { ok: true, lesson };
}

/** Every Derivation step in page order, with the lesson's inputs and functions. */
export function lessonModel(lesson: LessonSpec): Model {
  const steps: StepSpec[] = [];
  for (const section of lesson.sections) {
    for (const block of section.blocks) if (block.type === "Derivation") steps.push(...block.steps);
  }
  return { inputs: lesson.inputs, functions: lesson.functions, steps };
}

function stepPath(lesson: LessonSpec, stepId: string): PropertyKey[] {
  for (const [s, section] of lesson.sections.entries()) {
    for (const [b, block] of section.blocks.entries()) {
      if (block.type !== "Derivation") continue;
      const t = block.steps.findIndex((step) => step.id === stepId);
      if (t >= 0) return ["sections", s, "blocks", b, "steps", t];
    }
  }
  return [];
}

/**
 * Names a failing field the way an author reads the spec: section id, block number and type, then the field.
 * `raw` failed validation, so each step reads only the one property it needs.
 */
function locate(raw: unknown, path: PropertyKey[]): string {
  const parts: string[] = [];
  let node: unknown = raw;
  for (const [i, key] of path.entries()) {
    node = typeof node === "object" && node !== null ? (node as Record<PropertyKey, unknown>)[key] : undefined;
    const label = (field: string): string => {
      const value = typeof node === "object" && node !== null ? (node as Record<string, unknown>)[field] : undefined;
      return typeof value === "string" ? value : "";
    };
    if (typeof key !== "number") {
      parts.push(String(key));
    } else if (path[i - 1] === "sections") {
      const id = label("id");
      parts[parts.length - 1] = `sections[${key}]${id ? ` "${id}"` : ""}`;
    } else if (path[i - 1] === "blocks") {
      const type = label("type");
      parts[parts.length - 1] = `blocks[${key}]${type ? ` (${type})` : ""}`;
    } else {
      const name = label("id") || label("key");
      parts[parts.length - 1] += `[${key}]${name ? ` "${name}"` : ""}`;
    }
  }
  return parts.length ? parts.join(" > ") : "lesson";
}

/** Element keys use ":" so they cannot collide: section ids allow only lowercase letters, digits and hyphens. */
export function toRenderSpec(lesson: LessonSpec): RenderSpec {
  const root = { type: "Lesson", props: { title: lesson.title, subtitle: lesson.subtitle }, children: ["answer"] };
  const elements: RenderSpec["elements"] = {
    lesson: root,
    answer: { type: "Answer", props: { text: lesson.answer }, children: [] },
  };
  for (const section of lesson.sections) {
    const key = `section:${section.id}`;
    const element = { type: "Section", props: { id: section.id, title: section.title }, children: [] as string[] };
    root.children.push(key);
    elements[key] = element;
    for (const [i, block] of section.blocks.entries()) {
      const blockKey = `block:${section.id}:${i}`;
      const { type, ...props } = block;
      element.children.push(blockKey);
      elements[blockKey] = { type, props, children: [] };
    }
  }
  const model = lessonModel(lesson);
  const start = startValues(model.inputs);
  return { root: "lesson", elements, state: { model, start, inputs: start } };
}

export function lessonJsonSchema(): unknown {
  return z.toJSONSchema(Lesson, { io: "input" });
}

/** The published page: a full document embedding the render spec and loading the prebuilt renderer. */
export function lessonPage(lesson: LessonSpec): string {
  const renderSpec = toRenderSpec(lesson);
  const spec = JSON.stringify(renderSpec).replace(/</g, "\\u003c");
  const title = lesson.title.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    '<link rel="stylesheet" href="/assets/explain/katex.min.css"><link rel="stylesheet" href="/assets/explain/renderer.css">',
    "</head><body>",
    '<div id="app"></div>',
    `<script type="application/json" id="spec">${spec}</script>`,
    '<script type="module" src="/assets/explain/renderer.js"></script>',
    "</body></html>",
  ].join("\n");
}

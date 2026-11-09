/**
 * The lesson spec: the nested JSON an agent writes for an Explain page.
 * Validation and the published JSON Schema come from the shared prop catalog;
 * toRenderSpec turns a valid lesson into the flat element map json-render draws.
 */
import { z } from "zod";
import { AnswerProps, BLOCK_PROPS, LessonProps, SectionProps } from "./catalog";

const Block = z.discriminatedUnion("type", [BLOCK_PROPS.Concept.extend({ type: z.literal("Concept") })]);

const Section = SectionProps.extend({ blocks: z.array(Block).min(1) });

export const Lesson = LessonProps.extend({
  answer: AnswerProps.shape.text,
  sections: z.array(Section).min(1),
}).superRefine((lesson, ctx) => {
  const seen = new Set<string>();
  lesson.sections.forEach((section, i) => {
    if (seen.has(section.id)) ctx.addIssue({ code: "custom", path: ["sections", i, "id"], message: `duplicate section id "${section.id}"` });
    seen.add(section.id);
  });
});

export type LessonSpec = z.infer<typeof Lesson>;

/** json-render's flat spec: one entry per element, linked by child ids. */
export interface RenderSpec {
  root: string;
  elements: Record<string, { type: string; props: Record<string, unknown>; children: string[] }>;
  state: Record<string, unknown>;
}

export type ParseResult = { ok: true; lesson: LessonSpec } | { ok: false; errors: string[] };

export function parseLesson(raw: unknown): ParseResult {
  const result = Lesson.safeParse(raw);
  if (result.success) return { ok: true, lesson: result.data };
  return { ok: false, errors: result.error.issues.map((issue) => `${locate(raw, issue.path)}: ${issue.message}`) };
}

/**
 * Names a failing field the way an author reads the spec: section id, block number and type, then the field.
 * `raw` failed validation, so each step reads only the one property it needs.
 */
function locate(raw: unknown, path: PropertyKey[]): string {
  const parts: string[] = [];
  let node: unknown = raw;
  for (let i = 0; i < path.length; i++) {
    const key = path[i]!;
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
      parts[parts.length - 1] += `[${key}]`;
    }
  }
  return parts.length ? parts.join(" > ") : "lesson";
}

/** Element keys use ":" so they cannot collide: section ids allow only lowercase letters, digits and hyphens. */
export function toRenderSpec(lesson: LessonSpec): RenderSpec {
  const elements: RenderSpec["elements"] = {
    lesson: { type: "Lesson", props: { title: lesson.title, subtitle: lesson.subtitle }, children: ["answer"] },
    answer: { type: "Answer", props: { text: lesson.answer }, children: [] },
  };
  for (const section of lesson.sections) {
    const key = `section:${section.id}`;
    elements.lesson!.children.push(key);
    elements[key] = { type: "Section", props: { id: section.id, title: section.title }, children: [] };
    section.blocks.forEach((block, i) => {
      const blockKey = `block:${section.id}:${i}`;
      const { type, ...props } = block;
      elements[key]!.children.push(blockKey);
      elements[blockKey] = { type, props, children: [] };
    });
  }
  return { root: "lesson", elements, state: {} };
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

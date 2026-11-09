/**
 * Prop schemas for every Explain element: the single source for lesson validation,
 * the published JSON Schema (both in lesson.ts), and the renderer's json-render catalog (app.tsx).
 */
import { z } from "zod";

export const SectionId = z.string().regex(/^[a-z][a-z0-9-]*$/, "use lowercase letters, digits and hyphens");
/** A name mathjs can use as a symbol: input keys and step ids. */
export const Identifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "use letters, digits and underscores, starting with a letter");

/** Icons a spec may name; the renderer maps each to one Lucide icon. */
export const ICON_NAMES = ["wear", "ruler", "gauge", "zap", "wrench", "activity", "trending-up", "trending-down"] as const;
export const IconName = z.enum(ICON_NAMES);

export const Input = z.object({
  key: Identifier,
  label: z.string().min(1),
  value: z.number().describe("Starting value"),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  unit: z.string().min(1).optional().describe("mathjs unit, such as km or MB/s; the input enters formulas with this unit"),
});

export const Step = z.object({
  id: Identifier.describe("Name later steps use to reference this result"),
  title: z.string().min(1),
  plain: z.string().min(1).describe("One plain-language line saying what the step means"),
  ref: z.string().min(1).describe("Code reference this step implements, such as retry.py:42"),
  expr: z.string().min(1).describe("mathjs expression over inputs, functions and earlier step ids"),
  tex: z.string().min(1).optional().describe("Display formula in TeX; defaults to the expression"),
  substitute: z.string().min(1).optional().describe("Readable Substitute line with {name} placeholders; replaces the generated one"),
  unit: z.string().min(1).optional().describe("Unit to show the result in; required when the result carries a unit"),
  expect: z
    .number()
    .optional()
    .describe("The value the real code produced at the starting inputs, in the step's unit; publishing fails if the formula disagrees"),
});

export const Preset = z.object({ label: z.string().min(1), icon: IconName, set: z.record(z.string(), z.number()) });

export const LessonProps = z.object({ title: z.string().min(1), subtitle: z.string().min(1).optional() });
export const AnswerProps = z.object({ text: z.string().min(1).describe("The conclusion, shown first") });
export const SectionProps = z.object({ id: SectionId, title: z.string().min(1) });

/** Blocks an author can place inside a section, keyed by their `type`. */
export const BLOCK_PROPS = {
  Concept: z.object({
    simple: z.string().min(1).describe("Everyday explanation for a newcomer"),
    expert: z.string().min(1).describe("Precise explanation in the domain's terms"),
    tex: z.string().min(1).optional().describe("Optional formula in TeX, shown under the expert text"),
  }),
  Playground: z.object({
    presets: z.array(Preset).default([]).describe("What-if buttons; each sets some inputs, the rest keep their starting values"),
  }),
  Derivation: z.object({ steps: z.array(Step).min(1) }),
} as const;

export type InputSpec = z.infer<typeof Input>;
export type StepSpec = z.infer<typeof Step>;

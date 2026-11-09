/**
 * Prop schemas for every Explain element: the single source for lesson validation,
 * the published JSON Schema (both in lesson.ts), and the renderer's json-render catalog (app.tsx).
 */
import { z } from "zod";

export const SectionId = z.string().regex(/^[a-z][a-z0-9-]*$/, "use lowercase letters, digits and hyphens");
/** Any author text. Control characters are refused: the CLI prints spec text to a terminal, where they become escape sequences. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point.
export const Text = () => z.string().regex(/^[^\u0000-\u0008\u000b-\u001f\u007f-\u009f]*$/, "remove control characters");
const RESERVED = new Set(["__proto__", "constructor", "prototype"]);
/** A name mathjs can use as a symbol: input keys and step ids. */
export const Identifier = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "use letters, digits and underscores, starting with a letter")
  .refine((name) => !RESERVED.has(name), "this name is reserved");

/** Icons a spec may name; the renderer maps each to one Lucide icon. */
export const ICON_NAMES = ["wear", "ruler", "gauge", "zap", "wrench", "activity", "trending-up", "trending-down"] as const;
export const IconName = z.enum(ICON_NAMES);

export const Input = z.object({
  key: Identifier,
  label: Text().min(1),
  value: z.number().describe("Starting value"),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  unit: Text().min(1).optional().describe("mathjs unit, such as km or MB/s; the input enters formulas with this unit"),
});

export const Step = z.object({
  id: Identifier.describe("Name later steps use to reference this result"),
  title: Text().min(1),
  plain: Text().min(1).describe("One plain-language line saying what the step means"),
  ref: Text().min(1).describe("Code reference this step implements, such as retry.py:42"),
  expr: Text().min(1).describe("mathjs expression over inputs, functions and earlier step ids"),
  tex: Text().min(1).optional().describe("Display formula in TeX; defaults to the expression"),
  substitute: Text().min(1).optional().describe("Readable Substitute line with {name} placeholders; replaces the generated one"),
  unit: Text().min(1).optional().describe("Unit to show the result in; required when the result carries a unit"),
  expect: z
    .number()
    .optional()
    .describe("The value the real code produced at the starting inputs, in the step's unit; publishing fails if the formula disagrees"),
});

export const Preset = z.object({ label: Text().min(1), icon: IconName, set: z.record(Text(), z.number()) });

const EvidenceRow = z.object({
  claim: Text().min(1),
  value: Text().min(1),
  source: Text().min(1).describe("Where the value comes from: path:line, a commit, a command and its output"),
  inferred: z.boolean().default(false).describe("True when the claim was concluded rather than read from the source"),
});

const CompareRow = z.object({ label: Text().min(1), before: Text(), after: Text() });

const ChartTone = z.enum(["neutral", "good", "bad"]).default("neutral").describe("good and bad color the bar; meaning stays in the label");
const ChartBar = z.object({ label: Text().min(1), value: z.number(), tone: ChartTone });

export const LessonProps = z.object({ title: Text().min(1), subtitle: Text().min(1).optional() });
export const AnswerProps = z.object({ text: Text().min(1).describe("The conclusion, shown first") });
export const SectionProps = z.object({ id: SectionId, title: Text().min(1) });

/** Blocks an author can place inside a section, keyed by their `type`. */
export const BLOCK_PROPS = {
  Concept: z.object({
    simple: Text().min(1).describe("Everyday explanation for a newcomer"),
    expert: Text().min(1).describe("Precise explanation in the domain's terms"),
    tex: Text().min(1).optional().describe("Optional formula in TeX, shown under the expert text"),
  }),
  Playground: z.object({
    presets: z.array(Preset).default([]).describe("What-if buttons; each sets some inputs, the rest keep their starting values"),
  }),
  Derivation: z.object({ steps: z.array(Step).min(1) }),
  Quiz: z.object({
    question: Text().min(1),
    options: z.array(Text().min(1)).min(2).max(6),
    answer: z.number().int().nonnegative().describe("Index of the correct option, counting from 0"),
    why: Text().min(1).describe("Reason shown after the reader picks"),
  }),
  Evidence: z.object({ rows: z.array(EvidenceRow).min(1) }),
  Compare: z.object({
    before: Text().min(1).describe("Column heading for the old side, such as v11"),
    after: Text().min(1).describe("Column heading for the new side"),
    rows: z.array(CompareRow).min(1),
  }),
  Chart: z.object({ unit: Text().min(1).optional(), bars: z.array(ChartBar).min(1).max(12) }),
  Svg: z.object({ markup: Text().min(1).describe("Static SVG illustration using theme colors") }),
} as const;

export type InputSpec = z.infer<typeof Input>;
export type StepSpec = z.infer<typeof Step>;

/** KaTeX limits for spec TeX: no \\href-style trust, bounded sizes and macro expansion. */
export const KATEX_OPTIONS = { throwOnError: false, trust: false, strict: "warn", maxSize: 50, maxExpand: 1000 } as const;

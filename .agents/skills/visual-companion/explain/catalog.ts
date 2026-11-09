/**
 * Prop schemas for every Explain element: the single source for lesson validation,
 * the published JSON Schema (both in lesson.ts), and the renderer's json-render catalog (app.tsx).
 */
import { z } from "zod";

export const SectionId = z.string().regex(/^[a-z][a-z0-9-]*$/, "use lowercase letters, digits and hyphens");

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
} as const;

import { Lexer, type Token, type Tokens } from "marked";
import { z } from "zod";
import type { StageFormats } from "@/scripts/application/interfaces/stage-formats";
import { type Block, type Document, foldCards, type Section } from "@/scripts/domain/blocks";
import { ReviewError } from "@/scripts/domain/errors";
import type { StageManifest } from "@/scripts/domain/stages";

const collapse = (text: string): string => text.replace(/\s*\n\s*/g, " ");

function tokenToBlock(token: Token): Block | null {
  switch (token.type) {
    case "heading": {
      const { depth, text } = token as Tokens.Heading;
      return { type: "heading", level: depth <= 3 ? 3 : 4, text };
    }
    case "paragraph":
      return { type: "text", text: collapse((token as Tokens.Paragraph).text) };
    case "blockquote":
      return { type: "text", text: collapse((token as Tokens.Blockquote).text) };
    case "code":
      return { type: "code", text: (token as Tokens.Code).text };
    case "list": {
      const list = token as Tokens.List;
      return {
        type: "list",
        ordered: list.ordered,
        items: list.items.map((item) => item.text.trim()),
      };
    }
    case "table": {
      const table = token as Tokens.Table;
      return {
        type: "table",
        head: table.header.map((cell) => cell.text),
        rows: table.rows.map((row) => row.map((cell) => cell.text)),
      };
    }
    case "html": {
      const text = (token as Tokens.HTML).text.trim();
      return text.startsWith("<!--") ? null : { type: "code", text };
    }
    default:
      return null;
  }
}

const BlockSchema: z.ZodType<Block> = z.lazy(() =>
  z.discriminatedUnion(
    "type",
    [
      z.object({
        type: z.literal("heading"),
        level: z.union([z.literal(3), z.literal(4)]),
        text: z.string(),
      }),
      z.object({ type: z.literal("text"), text: z.string() }),
      z.object({ type: z.literal("code"), text: z.string() }),
      z.object({
        type: z.literal("list"),
        ordered: z.boolean().default(false),
        items: z.array(z.string()),
      }),
      z
        .object({
          type: z.literal("table"),
          head: z.array(z.string()),
          rows: z.array(z.array(z.string())),
        })
        .refine((table) => table.rows.every((row) => row.length === table.head.length), {
          message: "every row width must match head",
          path: ["rows"],
        }),
      z.object({
        type: z.literal("cards"),
        cards: z.array(z.object({ title: z.string(), blocks: z.array(BlockSchema) })),
      }),
    ],
    {
      error: (issue) =>
        issue.code === "invalid_union"
          ? `unknown block type '${String((issue.input as { type?: unknown } | null)?.type)}'`
          : undefined,
    },
  ),
);

const DocumentSchema = z.object({
  title: z.string(),
  sections: z.array(z.object({ title: z.string(), blocks: z.array(BlockSchema) })),
});

const ManifestSchema = z.object({
  title: z.string(),
  stages: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]+$/, "must be lowercase letters, digits, and dashes"),
        label: z.string().min(1),
        kind: z.enum(["spec", "markdown"]),
        source: z.string().min(1),
        approved: z.string().min(1).optional(),
        approvedSha256: z.string().min(1).optional(),
      }),
    )
    .min(1),
});

function parseJson(json: string, file: string, recovery: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new ReviewError(`${file} is not valid JSON`, recovery);
  }
}

function describe(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "document"}: ${issue.message}`)
    .join("; ");
}

/** `marked` converts markdown. `zod` validates the JSON files the agent edits. */
export class LocalStageFormats implements StageFormats {
  markdownToDocument(markdown: string): Document {
    let title = "";
    const sections: Section[] = [];
    let current: Section | null = null;
    for (const token of Lexer.lex(markdown)) {
      if (token.type === "heading") {
        const { depth, text } = token as Tokens.Heading;
        if (depth === 1) {
          title ||= text;
          continue;
        }
        if (depth === 2) {
          current = { title: text, blocks: [] };
          sections.push(current);
          continue;
        }
      }
      const block = tokenToBlock(token);
      if (!block) continue;
      if (!current) {
        current = { title: title || "Overview", blocks: [] };
        sections.push(current);
      }
      current.blocks.push(block);
    }
    return { title: title || "Review", sections: sections.map(foldCards) };
  }

  parseDocument(json: string): Document {
    const recovery = "Fix the blocks JSON, then render again.";
    const result = DocumentSchema.safeParse(parseJson(json, "Blocks file", recovery));
    if (!result.success) throw new ReviewError(`Blocks file: ${describe(result.error)}`, recovery);
    return result.data;
  }

  parseManifest(json: string): StageManifest {
    const recovery = "Fix stages.json, then render again.";
    const result = ManifestSchema.safeParse(parseJson(json, "stages.json", recovery));
    if (!result.success) throw new ReviewError(`stages.json: ${describe(result.error)}`, recovery);
    const seen = new Set<string>();
    for (const stage of result.data.stages) {
      if (seen.has(stage.id))
        throw new ReviewError(`stages.json: duplicate stage id '${stage.id}'`, recovery);
      seen.add(stage.id);
    }
    return result.data;
  }
}

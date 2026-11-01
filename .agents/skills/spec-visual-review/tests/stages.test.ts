import { describe, expect, it } from "bun:test";
import { RenderStages } from "@/scripts/application/use-cases/render-stages";
import { renderDocument } from "@/scripts/domain/blocks";
import { ReviewError } from "@/scripts/domain/errors";
import { sha256, stageStates } from "@/scripts/domain/stages";
import { LocalStageFormats } from "@/scripts/infrastructure/stage-formats";
import { InMemoryFiles } from "./fixtures";

const formats = new LocalStageFormats();
const markdownToDocument = (markdown: string) => formats.markdownToDocument(markdown);
const parseDocument = (json: string) => formats.parseDocument(json);
const parseManifest = (json: string) => formats.parseManifest(json);

const PLAN = `# Plan

## Design Decisions

| ID | Decision |
| --- | --- |
| D1 | Keep manifest v2 |

## Approaches

### A: Safety first

Fix commits.

### B: Full redesign

New format.

## Steps

1. One
2. Two

- loose <script>alert(1)</script>

\`\`\`text
a < b
\`\`\`
`;

const TEMPLATE = `<html><head><title>t</title></head><body><div class="review-shell"><header><h1>x</h1></header><main>old</main></div></body></html>`;

describe("given markdown, when converted to blocks", () => {
  const doc = markdownToDocument(PLAN);

  it("splits sections at level-2 headings", () => {
    expect(doc.title).toBe("Plan");
    expect(doc.sections.map((s) => s.title)).toEqual(["Design Decisions", "Approaches", "Steps"]);
  });

  it("turns a pipe table into head and rows", () => {
    expect(doc.sections[0]?.blocks[0]).toEqual({
      type: "table",
      head: ["ID", "Decision"],
      rows: [["D1", "Keep manifest v2"]],
    });
  });

  it("folds level-3 headings under Approaches into cards", () => {
    const block = doc.sections[1]?.blocks[0];
    expect(block?.type).toBe("cards");
    if (block?.type === "cards")
      expect(block.cards.map((c) => c.title)).toEqual(["A: Safety first", "B: Full redesign"]);
  });

  it("escapes markup so source text never runs", () => {
    const html = renderDocument(doc);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a &lt; b");
  });

  it("keeps the source wording of a table cell verbatim", () => {
    expect(renderDocument(doc)).toContain("Keep manifest v2");
  });
});

describe("given an override file, when parsed", () => {
  it("accepts a valid document", () => {
    const json = JSON.stringify({
      title: "T",
      sections: [{ title: "S", blocks: [{ type: "text", text: "hi" }] }],
    });
    expect(parseDocument(json).sections[0]?.title).toBe("S");
  });

  it("rejects an unknown block type with a message that names it", () => {
    const json = JSON.stringify({
      title: "T",
      sections: [{ title: "S", blocks: [{ type: "video" }] }],
    });
    expect(() => parseDocument(json)).toThrow(ReviewError);
    expect(() => parseDocument(json)).toThrow("video");
  });

  it("rejects a table row with the wrong width", () => {
    const json = JSON.stringify({
      title: "T",
      sections: [{ title: "S", blocks: [{ type: "table", head: ["a", "b"], rows: [["only"]] }] }],
    });
    expect(() => parseDocument(json)).toThrow("row");
  });
});

describe("given stage entries, when states are computed", () => {
  const entries = parseManifest(
    JSON.stringify({
      title: "T",
      stages: [
        {
          id: "spec",
          label: "Spec",
          kind: "markdown",
          source: "spec.md",
          approved: "2026-11-01",
          approvedSha256: sha256("v1"),
        },
        { id: "plan", label: "Plan", kind: "markdown", source: "plan.md" },
        { id: "tasks", label: "Tasks", kind: "markdown", source: "tasks.md" },
      ],
    }),
  ).stages;

  it("marks an unchanged approved stage as approved", () => {
    const states = stageStates(
      entries,
      new Map([
        ["spec.md", sha256("v1")],
        ["plan.md", sha256("p")],
        ["tasks.md", null],
      ]),
    );
    expect(states.map((s) => s.state)).toEqual(["approved", "draft", "missing"]);
  });

  it("marks an approved stage whose source changed, and warns the later stages", () => {
    const states = stageStates(
      entries,
      new Map([
        ["spec.md", sha256("v2")],
        ["plan.md", sha256("p")],
        ["tasks.md", null],
      ]),
    );
    expect(states[0]?.state).toBe("changed");
    expect(states[1]?.notes.join(" ")).toContain("Spec");
  });
});

describe("given a manifest with a bad stage, when parsed", () => {
  it("rejects duplicate ids", () => {
    const json = JSON.stringify({
      title: "T",
      stages: [
        { id: "a", label: "A", kind: "markdown", source: "a.md" },
        { id: "a", label: "B", kind: "markdown", source: "b.md" },
      ],
    });
    expect(() => parseManifest(json)).toThrow("duplicate");
  });
});

describe("given two stages, when the stages command runs", () => {
  function setup(approvedSha?: string) {
    const files = new InMemoryFiles();
    files.files.set(
      "/w/stages.json",
      JSON.stringify({
        title: "ai-sync",
        stages: [
          {
            id: "spec",
            label: "Spec",
            kind: "markdown",
            source: "spec.md",
            approved: "2026-11-01",
            ...(approvedSha ? { approvedSha256: approvedSha } : {}),
          },
          { id: "plan", label: "Plan", kind: "markdown", source: "plan.md" },
        ],
      }),
    );
    files.files.set("/w/spec.md", "# Spec\n\n## Goals\n\nShip.\n");
    files.files.set("/w/plan.md", PLAN);
    files.files.set("/t.html", TEMPLATE);
    const useCase = new RenderStages({
      files,
      formats,
      specBody: async () => ({ html: "<h2>x</h2>" }),
    });
    return { files, useCase };
  }
  const input = { manifestPath: "/w/stages.json", templatePath: "/t.html", outPath: "/w/out.html" };

  it("previews without writing anything", async () => {
    const { files, useCase } = setup();
    const result = await useCase.execute({ ...input, apply: false });
    expect(result.applied).toBe(false);
    expect(files.writes).toEqual([]);
  });

  it("keeps every stage in the page, each as its own panel", async () => {
    const { files, useCase } = setup();
    await useCase.execute({ ...input, apply: true });
    const page = files.files.get("/w/out.html") ?? "";
    expect(page.match(/<main data-stage=/g)?.length).toBe(2);
    expect(page).toContain('data-stage="spec"');
    expect(page).toContain("Keep manifest v2");
  });

  it("pins the hash of an approved stage the first time it is applied", async () => {
    const { files, useCase } = setup();
    const result = await useCase.execute({ ...input, apply: true });
    const saved = JSON.parse(files.files.get("/w/stages.json") ?? "{}");
    expect(saved.stages[0].approvedSha256).toBe(sha256("# Spec\n\n## Goals\n\nShip.\n"));
    expect(result.pinned).toEqual(["spec"]);
  });

  it("shows a changed-after-approval banner on later stages and never re-pins", async () => {
    const { files, useCase } = setup(sha256("old text"));
    const result = await useCase.execute({ ...input, apply: true });
    const page = files.files.get("/w/out.html") ?? "";
    expect(result.stages.map((s) => s.state)).toEqual(["changed", "draft"]);
    expect(page).toContain("changed after approval");
    expect(JSON.parse(files.files.get("/w/stages.json") ?? "{}").stages[0].approvedSha256).toBe(
      sha256("old text"),
    );
  });

  it("uses a blocks override instead of converting the markdown", async () => {
    const { files, useCase } = setup();
    files.files.set(
      "/w/plan.md.blocks.json",
      JSON.stringify({
        title: "P",
        sections: [{ title: "Custom", blocks: [{ type: "text", text: "from override" }] }],
      }),
    );
    await useCase.execute({ ...input, apply: true });
    expect(files.files.get("/w/out.html")).toContain("from override");
  });

  it("rejects a template without a main element", async () => {
    const { files, useCase } = setup();
    files.files.set(
      "/t.html",
      "<html><head><title>t</title></head><body><header></header></body></html>",
    );
    await expect(useCase.execute({ ...input, apply: true })).rejects.toThrow("main");
  });
});

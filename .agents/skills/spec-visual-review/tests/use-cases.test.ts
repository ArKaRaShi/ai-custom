import { beforeEach, describe, expect, it } from "bun:test";
import { ReviewState } from "@/scripts/application/services/review-state";
import { CheckReview } from "@/scripts/application/use-cases/check-review";
import { RenderReview } from "@/scripts/application/use-cases/render-review";
import { TranslateSpec } from "@/scripts/application/use-cases/translate-spec";
import { ReviewError } from "@/scripts/domain/errors";
import { hashText, parseSpec, translatables } from "@/scripts/domain/spec";
import { FakeTranslator, goodThai, InMemoryFiles, InMemoryStore, SPEC } from "./fixtures";

const SPEC_PATH = "/work/spec.md";
const TEMPLATE = "<title>t</title><header><h1>t</h1></header><main></main>";

describe("given a spec and an empty Thai cache", () => {
  let files: InMemoryFiles;
  let store: InMemoryStore;
  let translator: FakeTranslator;
  let state: ReviewState;
  let translate: TranslateSpec;

  beforeEach(() => {
    files = new InMemoryFiles();
    files.files.set(SPEC_PATH, SPEC);
    files.files.set("/work/template.html", TEMPLATE);
    store = new InMemoryStore();
    translator = new FakeTranslator();
    state = new ReviewState(files, store);
    translate = new TranslateSpec({ state, store, translator });
  });

  it("previews without calling the translator or writing the cache", async () => {
    const result = await translate.execute({ specPath: SPEC_PATH, apply: false });
    expect(result.applied).toBe(false);
    expect(result.missing.length).toBe(translatables(parseSpec(SPEC)).length);
    expect(translator.calls.length).toBe(0);
    expect(store.records.entries).toEqual({});
  });

  it("translates every missing line once when applied", async () => {
    const result = await translate.execute({ specPath: SPEC_PATH, apply: true });
    expect(result.missing).toEqual([]);
    expect(result.translated).toBe(Object.keys(store.records.entries).length);
    expect(store.records.model).toBe("fake-model");
  });

  it("translates nothing on a second run", async () => {
    await translate.execute({ specPath: SPEC_PATH, apply: true });
    translator.calls = [];
    await translate.execute({ specPath: SPEC_PATH, apply: true });
    expect(translator.calls.length).toBe(0);
  });

  it("retranslates only the line whose English changed, and drops stale entries", async () => {
    await translate.execute({ specPath: SPEC_PATH, apply: true });
    const oldKey = hashText("Previews protect files.");
    files.files.set(SPEC_PATH, SPEC.replace("Previews protect files.", "Previews guard files."));
    translator.calls = [];
    const result = await translate.execute({ specPath: SPEC_PATH, apply: true });
    expect(translator.calls).toEqual([["Previews guard files."]]);
    expect(result.translated).toBe(1);
    expect(store.records.entries[oldKey]).toBeUndefined();
  });

  it("keeps a human override through a later save and skips its automatic check", async () => {
    const wrong = new FakeTranslator(() => "เจ้าหน้าที่ทำให้ไฟล์เปลี่ยน");
    const bad = new TranslateSpec({ state, store, translator: wrong });
    await bad.execute({ specPath: SPEC_PATH, apply: true });
    const key = hashText("Previews MUST NOT mutate local files.");
    const before = await new CheckReview({ state }).execute({ specPath: SPEC_PATH });
    expect(before.findings.some((finding) => finding.key === key)).toBe(true);
    store.records.overrides[key] = { en: "Previews MUST NOT mutate local files.", th: "แก้ไขแล้ว" };
    await translate.execute({ specPath: SPEC_PATH, apply: true });
    const after = await new CheckReview({ state }).execute({ specPath: SPEC_PATH });
    expect(after.findings.some((finding) => finding.key === key)).toBe(false);
    expect(store.records.overrides[key]?.th).toBe("แก้ไขแล้ว");
    expect(after.overrides).toBe(1);
  });

  it("reports an incomplete check until every line has Thai", async () => {
    const before = await new CheckReview({ state }).execute({ specPath: SPEC_PATH });
    expect(before.status).toBe("incomplete");
    await translate.execute({ specPath: SPEC_PATH, apply: true });
    const after = await new CheckReview({ state }).execute({ specPath: SPEC_PATH });
    expect(after.status).toBe("complete");
  });

  it("refuses to render with missing Thai and names the command that fixes it", async () => {
    const render = new RenderReview({ state, files });
    const input = {
      specPath: SPEC_PATH,
      templatePath: "/work/template.html",
      outPath: "/work/out.html",
      extrasDir: null,
      apply: true,
      translateHint: "bun scripts/cli.ts translate spec.md --apply",
    };
    await expect(render.execute(input)).rejects.toThrow(ReviewError);
    try {
      await render.execute(input);
    } catch (error) {
      expect((error as ReviewError).recovery).toContain("translate");
    }
    expect(files.writes).toEqual([]);
  });

  it("writes the page only when applied", async () => {
    await translate.execute({ specPath: SPEC_PATH, apply: true });
    const render = new RenderReview({ state, files });
    const input = {
      specPath: SPEC_PATH,
      templatePath: "/work/template.html",
      outPath: "/work/out.html",
      extrasDir: null,
      apply: false,
      translateHint: "",
    };
    const preview = await render.execute(input);
    expect(preview.applied).toBe(false);
    expect(files.writes).toEqual([]);
    await render.execute({ ...input, apply: true });
    expect(files.files.get("/work/out.html")).toContain(
      goodThai("Previews MUST NOT mutate local files."),
    );
  });

  it("rejects a links file that names an unknown requirement or target", async () => {
    await translate.execute({ specPath: SPEC_PATH, apply: true });
    const render = new RenderReview({ state, files });
    const input = {
      specPath: SPEC_PATH,
      templatePath: "/work/template.html",
      outPath: "/work/out.html",
      extrasDir: "/work/extras",
      apply: false,
      translateHint: "",
    };
    files.files.set("/work/extras/links.json", JSON.stringify({ "FR-999": ["AC-01"] }));
    await expect(render.execute(input)).rejects.toThrow("unknown requirement");
    files.files.set("/work/extras/links.json", JSON.stringify({ "FR-001": ["AC-99"] }));
    await expect(render.execute(input)).rejects.toThrow("unknown id");
  });
});

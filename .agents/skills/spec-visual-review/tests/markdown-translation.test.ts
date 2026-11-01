import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { MarkdownTranslation } from "@/scripts/application/services/markdown-translation";
import { RenderStages } from "@/scripts/application/use-cases/render-stages";
import { hashText } from "@/scripts/domain/spec";
import { JsonThaiStore } from "@/scripts/infrastructure/json-thai-store";
import { LocalStageFormats } from "@/scripts/infrastructure/stage-formats";
import { FakeTranslator, InMemoryFiles } from "./fixtures";

const source = "/work/plan.md";
const markdown = "# Plan\n\n## Details\n\nA simple sentence.\n\n```sh\nrm -rf /tmp/example\n```\n";
const template = "<title>T</title><header>H</header><main>M</main>";

function setup() {
  const files = new InMemoryFiles();
  files.files.set(source, markdown);
  const formats = new LocalStageFormats();
  const store = new JsonThaiStore(files, `${source}.thai.json`);
  const translator = new FakeTranslator(() => "คำแปลภาษาไทย");
  return {
    files,
    formats,
    store,
    translator,
    service: new MarkdownTranslation({ files, formats, store, translator }),
  };
}

describe("given a Markdown stage, when translated and rendered, then cached Thai is source-specific", () => {
  it("previews missing lines without writes, then caches and reuses translations", async () => {
    const { service, files, translator } = setup();
    const preview = await service.execute({ sourcePath: source, apply: false });
    expect(preview.missing.length).toBeGreaterThan(0);
    expect(files.writes).toEqual([]);
    expect(translator.calls).toEqual([]);
    const translated = await service.execute({ sourcePath: source, apply: true });
    expect(translated.missing).toEqual([]);
    expect(translated.translated).toBeGreaterThan(0);
    const again = await service.execute({ sourcePath: source, apply: true });
    expect(again.translated).toBe(0);
    expect(translator.calls).toHaveLength(1);
    expect(translator.calls.flat().join(" ")).not.toContain("rm -rf");
  });

  it("treats empty cache entries as missing and reports bad machine translations", async () => {
    const { service, store } = setup();
    await service.execute({ sourcePath: source, apply: true });
    const records = await store.load();
    const [key, entry] = Object.entries(records.entries).find(
      ([, e]) => e.en === "A simple sentence.",
    )!;
    records.entries[key] = { ...entry, th: "" };
    await store.save(records.entries, records.model);
    const result = await service.check(source);
    expect(result.status).toBe("incomplete");
    expect(result.missing.length).toBe(1);
  });

  it("invalidates changed wording and keeps a human override", async () => {
    const { service, files, store } = setup();
    await service.execute({ sourcePath: source, apply: true });
    const records = await store.load();
    const [key, entry] = Object.entries(records.entries).find(
      ([, e]) => e.en === "A simple sentence.",
    )!;
    records.overrides[key] = { en: entry.en, th: "คำแปลโดยมนุษย์" };
    files.files.set(`${source}.thai.json`, JSON.stringify(records));
    const existing = await service.check(source);
    expect(existing.overrides).toBe(1);
    files.files.set(source, markdown.replace("A simple sentence.", "A different sentence."));
    const changed = await service.check(source);
    expect(changed.missing).toContain("A different sentence.");
    expect(changed.status).toBe("incomplete");
  });

  it("flags machine translations that lose a mandatory negation", async () => {
    const { service, files } = setup();
    files.files.set(source, "# Plan\n\n## Details\n\nChanges MUST NOT overwrite files.\n");
    const bad = new MarkdownTranslation({
      files,
      formats: new LocalStageFormats(),
      store: new JsonThaiStore(files, `${source}.thai.json`),
      translator: new FakeTranslator(() => "แปล"),
    });
    await bad.execute({ sourcePath: source, apply: true });
    const result = await service.check(source);
    expect(
      result.findings.some((finding) =>
        finding.reasons.some((reason) => reason.includes("negation")),
      ),
    ).toBe(true);
  });

  it("translates a whole paragraph while preserving protected tokens", async () => {
    const { files, store, formats } = setup();
    const text = "Read `config.yml` before updating HEAD. Keep the remote unchanged.";
    files.files.set(source, `# Plan\n\n## Details\n\n${text}\n`);
    const translator = new FakeTranslator((input) =>
      input.includes("Read ")
        ? `อ่าน ${input.match(/⟦\d+⟧/g)?.join(" ") ?? ""} ก่อนปรับปรุง remote`
        : "แปล",
    );
    const service = new MarkdownTranslation({ files, formats, store, translator });
    await service.execute({ sourcePath: source, apply: true });
    const entry = Object.values((await store.load()).entries).find((item) => item.en === text);
    expect(entry?.th).toContain("`config.yml`");
    expect(entry?.th).toContain("HEAD");
    expect(
      translator.calls
        .flat()
        .some((item) => item.includes("before updating") && item.includes("Keep the remote")),
    ).toBe(true);
  });

  it("retries an echoed paragraph sentence by sentence with paragraph context", async () => {
    const { files, store, formats } = setup();
    const text = "Read `config.yml` before changes. It controls the remote.";
    files.files.set(source, `# Plan\n\n## Details\n\n${text}\n`);
    const contextsSeen: string[] = [];
    const translator = {
      model: "test",
      async translate(texts: readonly string[], contexts?: readonly string[]): Promise<string[]> {
        if (contexts) contextsSeen.push(...contexts);
        return texts.map((item) => {
          if (item.includes("before changes.") && item.includes("It controls")) return item;
          if (contexts && item.includes("before changes.")) return contexts[0] ?? "";
          if (item.includes("before changes.")) return `อ่าน ${item.match(/⟦\d+⟧/)?.[0]} ก่อนแก้ไข`;
          if (item.includes("It controls")) return "ไฟล์นี้ควบคุม remote";
          return "คำแปล";
        });
      },
    };
    const service = new MarkdownTranslation({ files, formats, store, translator });
    await service.execute({ sourcePath: source, apply: true });
    const check = await service.check(source);
    expect(check.missing).not.toContain(text);
    const result = Object.values((await store.load()).entries).find((entry) => entry.en === text);
    expect(result?.th).toContain("`config.yml`");
    expect(result?.th).toContain("ไฟล์นี้ควบคุม remote");
    expect(
      contextsSeen.some(
        (context) => context.includes("before changes.") && context.includes("It controls"),
      ),
    ).toBe(true);
  });

  it("invalidates old machine echoes while preserving human overrides", async () => {
    const { files, store, service } = setup();
    const sentence = "A simple sentence.";
    const key = hashText(sentence);
    files.files.set(
      `${source}.thai.json`,
      JSON.stringify({
        model: "old-model",
        entries: { [key]: { en: sentence, th: sentence } },
        overrides: { [hashText("Details")]: { en: "Details", th: "รายละเอียดโดยมนุษย์" } },
      }),
    );
    const before = await service.check(source);
    expect(before.missing).toContain(sentence);
    expect(before.overrides).toBe(1);
    await service.execute({ sourcePath: source, apply: true });
    expect((await store.load()).overrides[hashText("Details")]?.th).toBe("รายละเอียดโดยมนุษย์");
  });

  it("does not render an English echo as a Thai translation", async () => {
    const { files, formats, store } = setup();
    const service = new MarkdownTranslation({
      files,
      formats,
      store,
      translator: new FakeTranslator((text) => text),
    });
    await service.execute({ sourcePath: source, apply: true });
    const check = await service.check(source);
    expect(check.missing).toContain("A simple sentence.");
    expect(check.findings.some((finding) => finding.reasons.join(" ").includes("English"))).toBe(
      true,
    );
  });

  it("rejects a mixed Thai line that copies a long English passage", async () => {
    const { files, formats, store } = setup();
    const text = "Apply validates the remote before making any changes.";
    files.files.set(source, `# Plan\n\n## Details\n\n${text}\n`);
    const service = new MarkdownTranslation({
      files,
      formats,
      store,
      translator: new FakeTranslator((input) =>
        input === text ? "ภาษาไทย Apply validates the remote before making any changes." : "คำแปล",
      ),
    });
    await service.execute({ sourcePath: source, apply: true });
    expect((await service.check(source)).missing).toContain(text);
  });

  it("rejects translations that drop a protected token", async () => {
    const { files, store, formats } = setup();
    const text = "Read `config.yml` before updating HEAD.";
    files.files.set(source, `# Plan\n\n## Details\n\n${text}\n`);
    const service = new MarkdownTranslation({
      files,
      formats,
      store,
      translator: new FakeTranslator(() => "คำแปลภาษาไทย"),
    });
    await service.execute({ sourcePath: source, apply: true });
    const check = await service.check(source);
    expect(check.missing).toContain(text);
    expect(check.findings.some((finding) => finding.reasons.join(" ").includes("token"))).toBe(
      true,
    );
  });

  it("renders cached translations only for their own source", async () => {
    const { files, formats, service } = setup();
    await service.execute({ sourcePath: source, apply: true });
    files.files.set("/work/other.md", markdown);
    files.files.set(
      "/work/stages.json",
      JSON.stringify({
        title: "Review",
        stages: [
          { id: "plan", label: "Plan", kind: "markdown", source: "plan.md" },
          { id: "other", label: "Other", kind: "markdown", source: "other.md" },
        ],
      }),
    );
    files.files.set("/work/template.html", template);
    await new RenderStages({
      files,
      formats,
      specBody: async () => ({ html: "" }),
      markdownStore: (path) => new JsonThaiStore(files, path),
    }).execute({
      manifestPath: "/work/stages.json",
      templatePath: "/work/template.html",
      outPath: "/work/review.html",
      apply: true,
    });
    const html = files.files.get("/work/review.html")!;
    const [plan, other] = html.split('<main data-stage="other">');
    expect(plan).toContain("คำแปลภาษาไทย");
    expect(other).not.toContain("คำแปลภาษาไทย");
    expect(html).toContain("rm -rf /tmp/example");
  });
});

describe("given the Markdown CLI, when checking or previewing without a cache, then it reports missing text without writing", () => {
  it("returns incomplete for check and a read-only translation preview", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "markdown-review-"));
    try {
      const file = path.join(dir, "plan.md");
      fs.writeFileSync(file, markdown);
      const cli = path.resolve(import.meta.dir, "../scripts/cli.ts");
      const run = async (command: string) => {
        const child = Bun.spawn(["bun", cli, command, file, "--format=json"], {
          stdout: "pipe",
          stderr: "pipe",
        });
        const [out, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
        return { code, result: JSON.parse(out).result };
      };
      const check = await run("check-markdown");
      expect(check.code).toBe(1);
      expect(check.result.status).toBe("incomplete");
      expect(check.result.missing.length).toBeGreaterThan(0);
      const preview = await run("translate-markdown");
      expect(preview.code).toBe(0);
      expect(preview.result.applied).toBe(false);
      expect(preview.result.missing.length).toBeGreaterThan(0);
      expect(fs.existsSync(`${file}.thai.json`)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

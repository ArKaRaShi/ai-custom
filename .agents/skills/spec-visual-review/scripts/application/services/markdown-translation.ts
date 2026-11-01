import type { ReviewFiles } from "@/scripts/application/interfaces/review-files";
import type { StageFormats } from "@/scripts/application/interfaces/stage-formats";
import type { ThaiEntry, ThaiStore } from "@/scripts/application/interfaces/thai-store";
import type { Translator } from "@/scripts/application/interfaces/translator";
import type { Document } from "@/scripts/domain/blocks";
import {
  englishEcho,
  markdownTranslatables,
  preservesMarkdownTokens,
  protectMarkdown,
} from "@/scripts/domain/blocks";
import { ReviewError } from "@/scripts/domain/errors";
import { checkThai, type Finding, keepEnglishWords } from "@/scripts/domain/glossary";
import { hashText } from "@/scripts/domain/spec";

const CACHE_VERSION = "|markdown-context-v1";

/** Each source owns its own cache, including when files share a directory. */
export function markdownStorePath(sourcePath: string): string {
  return `${sourcePath}.thai.json`;
}

export async function loadMarkdownDocument(
  files: ReviewFiles,
  formats: StageFormats,
  sourcePath: string,
): Promise<Document> {
  const text = await files.readText(sourcePath);
  const override = await files.readOptionalText(`${sourcePath}.blocks.json`);
  return override === null ? formats.markdownToDocument(text) : formats.parseDocument(override);
}

interface MarkdownResolution {
  texts: string[];
  translations: Map<string, string>;
  missing: string[];
  findings: Finding[];
  overrides: number;
  entries: Record<string, ThaiEntry>;
}

export async function resolveMarkdown(
  doc: Document,
  store: ThaiStore,
): Promise<MarkdownResolution> {
  const texts = [...new Set(markdownTranslatables(doc))];
  const records = await store.load();
  const translations = new Map<string, string>();
  const missing: string[] = [];
  const findings: Finding[] = [];
  let overrides = 0;
  for (const [index, text] of texts.entries()) {
    const key = hashText(text);
    const id = `MD-${index + 1}`;
    const override = records.overrides[key];
    const machine = records.entries[key];
    const chosen = override?.en === text && override.th.trim() ? override : machine;
    if (!chosen || chosen.en !== text) {
      missing.push(text);
      continue;
    }
    if (!chosen.th.trim()) {
      if (chosen !== override)
        findings.push({ id, key, reasons: ["empty translation or protected token mismatch"] });
      missing.push(text);
      continue;
    }
    if (
      chosen === override &&
      (englishEcho(text, chosen.th) || !preservesMarkdownTokens(text, chosen.th))
    ) {
      findings.push({
        id,
        key,
        reasons: [
          "human override contains untranslated English or is missing protected tokens; correct the override",
        ],
      });
      missing.push(text);
      continue;
    }
    if (chosen === override) {
      translations.set(text, chosen.th);
      overrides++;
      continue;
    }
    const reasons: string[] = [];
    if (!records.model.endsWith(CACHE_VERSION))
      reasons.push("legacy machine translation requires regeneration");
    if (englishEcho(text, chosen.th)) reasons.push("English echo or untranslated prose");
    if (!preservesMarkdownTokens(text, chosen.th))
      reasons.push("protected technical tokens missing");
    if (reasons.length) {
      findings.push({ id, key, reasons });
      missing.push(text);
      continue;
    }
    translations.set(text, chosen.th);
    const finding = checkThai(id, key, text, chosen.th);
    if (finding) findings.push(finding);
  }
  return {
    texts,
    translations,
    missing,
    findings,
    overrides,
    entries: records.model.endsWith(CACHE_VERSION) ? records.entries : {},
  };
}

export class MarkdownTranslation {
  constructor(
    private readonly deps: {
      files: ReviewFiles;
      formats: StageFormats;
      store: ThaiStore;
      translator: Translator;
    },
  ) {}

  async check(sourcePath: string): Promise<{
    status: "complete" | "incomplete";
    total: number;
    overrides: number;
    missing: string[];
    findings: Finding[];
  }> {
    const state = await resolveMarkdown(
      await loadMarkdownDocument(this.deps.files, this.deps.formats, sourcePath),
      this.deps.store,
    );
    return {
      status: state.missing.length ? "incomplete" : "complete",
      total: state.texts.length,
      overrides: state.overrides,
      missing: state.missing,
      findings: state.findings,
    };
  }

  async execute(input: { sourcePath: string; apply: boolean }): Promise<{
    applied: boolean;
    total: number;
    cached: number;
    missing: string[];
    translated: number;
    findings: Finding[];
  }> {
    const doc = await loadMarkdownDocument(this.deps.files, this.deps.formats, input.sourcePath);
    const before = await resolveMarkdown(doc, this.deps.store);
    if (!input.apply || before.missing.length === 0)
      return {
        applied: false,
        total: before.texts.length,
        cached: before.translations.size,
        missing: before.missing,
        translated: 0,
        findings: before.findings,
      };
    const protectedTexts = before.missing.map(protectMarkdown);
    const thai = await this.deps.translator.translate(protectedTexts.map((item) => item.masked));
    if (thai.length !== before.missing.length)
      throw new ReviewError(
        `Translator returned ${thai.length} lines for ${before.missing.length} inputs`,
      );
    const retries: { index: number; sentences: string[]; context: string }[] = [];
    const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
    for (const [index, protectedText] of protectedTexts.entries()) {
      const result = protectedText.restore(thai[index] ?? "");
      if (result !== null && !englishEcho(before.missing[index] ?? "", result)) continue;
      const sentences = [...segmenter.segment(protectedText.masked)]
        .map((part) => part.segment.trim())
        .filter(Boolean);
      if (sentences.length > 1) retries.push({ index, sentences, context: protectedText.masked });
    }
    if (retries.length) {
      const sentences = retries.flatMap((retry) => retry.sentences);
      const contexts = retries.flatMap((retry) => retry.sentences.map(() => retry.context));
      const translated = await this.deps.translator.translate(sentences, contexts);
      if (translated.length !== sentences.length)
        throw new ReviewError(
          `Translator returned ${translated.length} lines for ${sentences.length} inputs`,
        );
      const valid = (source: string, result: string): boolean => {
        const markers = (value: string) => (value.match(/⟦\d+⟧/g) ?? []).sort().join(",");
        return markers(source) === markers(result) && !englishEcho(source, result);
      };
      const failed = sentences.flatMap((sentence, index) =>
        valid(sentence, translated[index] ?? "") ? [] : [index],
      );
      if (failed.length) {
        const isolated = await this.deps.translator.translate(
          failed.map((index) => sentences[index] ?? ""),
        );
        if (isolated.length !== failed.length)
          throw new ReviewError(
            `Translator returned ${isolated.length} lines for ${failed.length} inputs`,
          );
        failed.forEach((index, position) => {
          translated[index] = isolated[position] ?? "";
        });
      }
      let offset = 0;
      for (const retry of retries) {
        const parts = translated.slice(offset, offset + retry.sentences.length);
        offset += retry.sentences.length;
        if (parts.every((part, index) => valid(retry.sentences[index] ?? "", part))) {
          thai[retry.index] = parts.join(" ");
        }
      }
    }
    const entries = { ...before.entries };
    before.missing.forEach((text, index) => {
      const restored = protectedTexts[index]?.restore(thai[index] ?? "");
      entries[hashText(text)] = {
        en: text,
        th: restored === null || restored === undefined ? "" : keepEnglishWords(text, restored),
      };
    });
    await this.deps.store.save(entries, `${this.deps.translator.model}${CACHE_VERSION}`);
    const after = await resolveMarkdown(doc, this.deps.store);
    return {
      applied: true,
      total: after.texts.length,
      cached: after.translations.size,
      missing: after.missing,
      translated: before.missing.length - after.missing.length,
      findings: after.findings,
    };
  }
}

import type { ThaiEntry, ThaiStore } from "@/scripts/application/interfaces/thai-store";
import type { Translator } from "@/scripts/application/interfaces/translator";
import type { ReviewState } from "@/scripts/application/services/review-state";
import { ReviewError } from "@/scripts/domain/errors";
import { type Finding, keepEnglishWords } from "@/scripts/domain/glossary";

export interface TranslateSpecInput {
  specPath: string;
  apply: boolean;
}

export interface TranslateSpecOutput {
  applied: boolean;
  total: number;
  cached: number;
  /** Ids of items that need a Thai line. Without `apply` these were not translated. */
  missing: string[];
  translated: number;
  findings: Finding[];
}

/** Fills the Thai cache for lines that have none. Previews by default. */
export class TranslateSpec {
  constructor(
    private readonly deps: { state: ReviewState; store: ThaiStore; translator: Translator },
  ) {}

  async execute(input: TranslateSpecInput): Promise<TranslateSpecOutput> {
    const before = await this.deps.state.load(input.specPath);
    const missingIds = before.missing.map((item) => item.id);
    const cached = before.items.length - missingIds.length;
    if (!input.apply || before.missing.length === 0) {
      return {
        applied: false,
        total: before.items.length,
        cached,
        missing: missingIds,
        translated: 0,
        findings: before.findings,
      };
    }
    const texts = before.missing.map((item) => item.text);
    const thai = await this.deps.translator.translate(texts);
    if (thai.length !== texts.length) {
      throw new ReviewError(`Translator returned ${thai.length} lines for ${texts.length} inputs`);
    }
    const wanted = new Set(before.items.map((item) => item.key));
    const entries: Record<string, ThaiEntry> = {};
    for (const [key, entry] of Object.entries(before.records.entries)) {
      if (wanted.has(key)) entries[key] = entry;
    }
    before.missing.forEach((item, index) => {
      entries[item.key] = { en: item.text, th: keepEnglishWords(item.text, thai[index] ?? "") };
    });
    await this.deps.store.save(entries, this.deps.translator.model);
    const after = await this.deps.state.load(input.specPath);
    return {
      applied: true,
      total: after.items.length,
      cached: after.items.length - after.missing.length,
      missing: after.missing.map((item) => item.id),
      translated: texts.length,
      findings: after.findings,
    };
  }
}

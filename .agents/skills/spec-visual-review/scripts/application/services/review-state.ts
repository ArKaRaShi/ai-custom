import type { ReviewFiles } from "@/scripts/application/interfaces/review-files";
import type { ThaiRecords, ThaiStore } from "@/scripts/application/interfaces/thai-store";
import { checkThai, type Finding } from "@/scripts/domain/glossary";
import {
  type ParsedSpec,
  parseSpec,
  type Translatable,
  translatables,
} from "@/scripts/domain/spec";

export interface Resolution {
  spec: ParsedSpec;
  items: Translatable[];
  /** Thai text by English hash. Overrides win over machine translations. */
  thaiByKey: ReadonlyMap<string, string>;
  /** One entry per distinct English wording that has no Thai line yet. */
  missing: Translatable[];
  /** Machine translations that failed an automatic check. Overrides skip the check. */
  findings: Finding[];
  records: ThaiRecords;
}

/** Loads a spec and its Thai records, and works out which lines are missing or suspect. */
export class ReviewState {
  constructor(
    private readonly files: ReviewFiles,
    private readonly store: ThaiStore,
  ) {}

  async load(specPath: string): Promise<Resolution> {
    const spec = parseSpec(await this.files.readText(specPath));
    const records = await this.store.load();
    const items = translatables(spec);
    const thaiByKey = new Map<string, string>();
    const missing = new Map<string, Translatable>();
    const findings: Finding[] = [];
    for (const item of items) {
      const override = records.overrides[item.key];
      const machine = records.entries[item.key];
      const chosen = override ?? machine;
      if (!chosen) {
        if (!missing.has(item.key)) missing.set(item.key, item);
        continue;
      }
      thaiByKey.set(item.key, chosen.th);
      if (override) continue;
      const finding = checkThai(item.id, item.key, item.text, chosen.th);
      if (finding) findings.push(finding);
    }
    return { spec, items, thaiByKey, missing: [...missing.values()], findings, records };
  }
}

import type { ReviewFiles } from "@/scripts/application/interfaces/review-files";
import type {
  ThaiEntry,
  ThaiRecords,
  ThaiStore,
} from "@/scripts/application/interfaces/thai-store";
import { ReviewError } from "@/scripts/domain/errors";

function readEntries(value: unknown, section: string): Record<string, ThaiEntry> {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ReviewError(`Thai store '${section}' must be an object`);
  }
  const result: Record<string, ThaiEntry> = {};
  for (const [key, entry] of Object.entries(value)) {
    const { en, th } = (entry ?? {}) as Partial<ThaiEntry>;
    if (typeof en !== "string" || typeof th !== "string") {
      throw new ReviewError(`Thai store '${section}' entry '${key}' needs string 'en' and 'th'`);
    }
    result[key] = { en, th };
  }
  return result;
}

/** Keeps Thai lines in one JSON file. Human `overrides` survive every save. */
export class JsonThaiStore implements ThaiStore {
  constructor(
    private readonly files: ReviewFiles,
    private readonly path: string,
  ) {}

  async load(): Promise<ThaiRecords> {
    const text = await this.files.readOptionalText(this.path);
    if (text === null) return { model: "", entries: {}, overrides: {} };
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new ReviewError(`Thai store ${this.path} is not valid JSON`);
    }
    return {
      model: typeof parsed.model === "string" ? parsed.model : "",
      entries: readEntries(parsed.entries, "entries"),
      overrides: readEntries(parsed.overrides, "overrides"),
    };
  }

  async save(entries: Record<string, ThaiEntry>, model: string): Promise<void> {
    const current = await this.load();
    const body = { model, entries, overrides: current.overrides };
    await this.files.writeText(this.path, `${JSON.stringify(body, null, 2)}\n`);
  }
}

export interface ThaiEntry {
  en: string;
  th: string;
}

/** Thai lines keyed by a hash of the exact English wording. */
export interface ThaiRecords {
  model: string;
  /** Machine translations. Rewritten by `translate --apply`. */
  entries: Record<string, ThaiEntry>;
  /** Human corrections. Never rewritten by the tool, and they win over `entries`. */
  overrides: Record<string, ThaiEntry>;
}

export interface ThaiStore {
  load(): Promise<ThaiRecords>;
  save(entries: Record<string, ThaiEntry>, model: string): Promise<void>;
}

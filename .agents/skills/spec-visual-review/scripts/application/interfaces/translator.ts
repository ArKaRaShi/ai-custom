/** Translates English review text into Thai. Implementations may be slow and local. */
export interface Translator {
  /** Identifies the model so cached lines record where they came from. */
  readonly model: string;
  /** Returns one Thai string per input string, in the same order. */
  translate(texts: readonly string[]): Promise<string[]>;
}

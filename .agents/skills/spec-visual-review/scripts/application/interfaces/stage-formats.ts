import type { Document } from "@/scripts/domain/blocks";
import type { StageManifest } from "@/scripts/domain/stages";

/** Reads and validates the files a stage review depends on. Failures throw `ReviewError` with a recovery hint. */
export interface StageFormats {
  /** Converts a markdown source to blocks. */
  markdownToDocument(markdown: string): Document;
  /** Validates a `<source>.blocks.json` override. */
  parseDocument(json: string): Document;
  /** Validates `stages.json`. */
  parseManifest(json: string): StageManifest;
}

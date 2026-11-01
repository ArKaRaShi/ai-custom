/** File access the review commands need. Paths are used exactly as given. */
export interface ReviewFiles {
  /** Reads a file. Throws when it is missing. */
  readText(path: string): Promise<string>;
  /** Reads a file, or returns `null` when it does not exist. */
  readOptionalText(path: string): Promise<string | null>;
  /** Writes a file by replacing it atomically, creating parent folders. */
  writeText(path: string, content: string): Promise<void>;
}

/**
 * Streams human-readable progress lines while a use case runs, for flows that interleave output
 * with prompts or subprocesses (interactive resolve, installer progress). Final results are
 * returned as data and rendered by presentation instead.
 */
export interface Reporter {
  /** One line on stdout. */
  info(line: string): void;
  /** One line on stderr. */
  error(line: string): void;
}

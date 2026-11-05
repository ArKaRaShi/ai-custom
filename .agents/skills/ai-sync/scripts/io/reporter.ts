/**
 * Streams human-readable progress lines straight to the terminal while a command runs, for flows
 * that interleave output with prompts or subprocesses (interactive resolve, installer progress).
 * Final results are returned as data and rendered by `render/` instead. `io.reporter`.
 */
export const reporter = {
  /** One line on stdout. */
  info(line: string): void {
    console.log(line);
  },

  /** One line on stderr. */
  error(line: string): void {
    console.error(line);
  },
};

export type Reporter = typeof reporter;

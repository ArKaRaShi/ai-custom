/** Raised for invalid command-line usage. */
export class UsageError extends Error {}

/** Raised when a spec file does not contain the expected sections. */
export class SpecParseError extends Error {}

/** Raised for a failed review operation. `recovery` names the command that fixes it. */
export class ReviewError extends Error {
  readonly recovery: string | undefined;

  constructor(message: string, recovery?: string) {
    super(message);
    this.recovery = recovery;
  }
}

export interface Prompter {
  /** Prints `question` and resolves with the user's answer line. */
  ask(question: string): Promise<string>;
}

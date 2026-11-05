import * as readline from "node:readline";

/** Reads answers from the terminal; `io.prompter`. */
export const prompter = {
  /** Prints `question` and resolves with the user's answer line. */
  async ask(question: string): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
    rl.close();
    return answer;
  },
};

export type Prompter = typeof prompter;

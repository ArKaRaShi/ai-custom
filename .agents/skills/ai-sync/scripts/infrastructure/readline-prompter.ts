import * as readline from "node:readline";
import type { Prompter } from "@/scripts/application/interfaces/prompter";

export class ReadlinePrompter implements Prompter {
  async ask(question: string): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
    rl.close();
    return answer;
  }
}

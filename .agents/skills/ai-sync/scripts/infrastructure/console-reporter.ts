import type { Reporter } from "@/scripts/application/interfaces/reporter";

/** Writes progress lines straight to the terminal. */
export class ConsoleReporter implements Reporter {
  info(line: string): void {
    console.log(line);
  }

  error(line: string): void {
    console.error(line);
  }
}

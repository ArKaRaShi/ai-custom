import type { GreetOutput } from "../../application/use-cases/greet";

export function render(output: GreetOutput): string {
  return `✔ ${output.text}`;
}

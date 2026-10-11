import type { GreetInput } from "../../application/use-cases/greet";

export function parseArgs(argv: string[]): GreetInput {
  const name = argv[0];
  if (!name) throw new Error("greet: missing <name>. Run 'greet --help' for usage.");
  return { name };
}

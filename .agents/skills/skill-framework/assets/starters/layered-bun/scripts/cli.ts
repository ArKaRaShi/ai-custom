import { Greet } from "./application/use-cases/greet";
import { parseArgs } from "./presentation/cli/parse-args";
import { render } from "./presentation/cli/render";

/** Composition root: parse, build objects, run one use case, render. No decisions here. */
export function main(argv: string[]): number {
  try {
    console.log(render(new Greet().execute(parseArgs(argv))));
    return 0;
  } catch (error: unknown) {
    console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (import.meta.main) process.exit(main(Bun.argv.slice(2)));

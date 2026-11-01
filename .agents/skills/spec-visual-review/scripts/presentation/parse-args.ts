import { UsageError } from "@/scripts/domain/errors";

export const COMMANDS = ["check", "translate", "render", "stages", "setup"] as const;
export type Command = (typeof COMMANDS)[number];

export interface ParsedArgs {
  help: boolean;
  command: Command | null;
  spec: string | null;
  apply: boolean;
  verbose: boolean;
  format: "tree" | "json";
  store: string | null;
  extras: string | null;
  out: string | null;
  template: string | null;
}

export const USAGE = `Usage: bun scripts/cli.ts <command> [spec.md] [options]

Commands:
  check <spec>       List Thai lines that are missing or flagged for review
  translate <spec>   Fill missing Thai lines with the local model (preview by default)
  render <spec>      Build the bilingual review page (preview by default)
  stages <stages.json>  Build one read-only page that keeps every stage (preview by default)
  setup              Install the Python environment and model (preview by default)

Boolean options:
  --apply            Commit the change. Without it, translate, render and setup only preview
  --verbose          Print every item instead of the first 15 per group
  -h, --help         Show this help

Value options (accept '--name value' and '--name=value'):
  --format <tree|json>   Output style. Default: tree
  --store <file>         Thai records. Default: <spec folder>/.visual-review/thai.json
  --extras <dir>         Optional links.json, pre.html, post.html, entities.html.
                         Default: <spec folder>/.visual-review
  --out <file>           Page to write. Default: <spec folder>/.visual-review/review.html
  --template <file>      Page template. Default: assets/review-template.html in the skill
`;

type ValueOption = "format" | "store" | "extras" | "out" | "template";

const VALUE_OPTIONS: Readonly<Record<string, ValueOption>> = {
  "--format": "format",
  "--store": "store",
  "--extras": "extras",
  "--out": "out",
  "--template": "template",
};

function isCommand(value: string): value is Command {
  return (COMMANDS as readonly string[]).includes(value);
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const args: ParsedArgs = {
    help: false,
    command: null,
    spec: null,
    apply: false,
    verbose: false,
    format: "tree",
    store: null,
    extras: null,
    out: null,
    template: null,
  };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] ?? "";
    const [name, inline] = token.startsWith("--") ? splitOption(token) : [token, undefined];
    const target = VALUE_OPTIONS[name];
    if (name === "-h" || name === "--help") args.help = true;
    else if (name === "--apply") args.apply = true;
    else if (name === "--verbose") args.verbose = true;
    else if (target) {
      const value = inline ?? argv[++i];
      if (value === undefined || value.startsWith("--")) {
        throw new UsageError(`Option ${name} needs a value`);
      }
      if (target === "format") {
        if (value !== "tree" && value !== "json")
          throw new UsageError("--format must be tree or json");
        args.format = value;
      } else args[target] = value;
    } else if (token.startsWith("-")) throw new UsageError(`Unknown option ${name}`);
    else positional.push(token);
  }
  if (args.help) return args;
  const [command, spec, ...extra] = positional;
  if (!command || !isCommand(command)) {
    throw new UsageError(`Expected one of: ${COMMANDS.join(", ")}`);
  }
  args.command = command;
  if (extra.length > 0) throw new UsageError(`Unexpected argument ${extra[0]}`);
  if (command === "setup") {
    if (spec) throw new UsageError("setup takes no spec file");
  } else if (!spec) throw new UsageError(`${command} needs an input file`);
  args.spec = spec ?? null;
  return args;
}

function splitOption(token: string): [string, string | undefined] {
  const eq = token.indexOf("=");
  return eq < 0 ? [token, undefined] : [token.slice(0, eq), token.slice(eq + 1)];
}

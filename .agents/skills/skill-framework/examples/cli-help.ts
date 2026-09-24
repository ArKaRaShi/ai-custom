const args = process.argv.slice(2);
const topUsage = "Usage: bun examples/cli-help.ts inspect <identifier> [--verbose] [--format <value>|--format=<value>]";
const inspectUsage = "Usage: ... inspect <identifier> [--verbose] [--format <value>|--format=<value>]";

function fail(message: string): never {
  console.error(message);
  process.exitCode = 1;
  return process.exit();
}

if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
  console.log(`${topUsage}\n\nCommands:\n  inspect <identifier>  Inspect an identifier`);
} else if (args[0] !== "inspect") {
  fail(args.length === 0 ? `Missing command.\n${topUsage}` : `Unknown command: ${args[0]}\n${topUsage}`);
} else if (args.slice(1).some((arg) => arg === "--help" || arg === "-h")) {
  console.log(`${inspectUsage}\n\nOptions:\n  --verbose           Show verbose output\n  --format <value>, --format=<value>  Set output format`);
} else {
  let identifier: string | undefined;
  let verbose = false;
  let format: string | undefined;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--verbose") {
      verbose = true;
    } else if (arg === "--format") {
      const value = args[++i];
      if (!value || value.startsWith("-")) fail("--format requires a value");
      format = value;
    } else if (arg.startsWith("--format=")) {
      format = arg.slice("--format=".length);
      if (!format) fail("--format requires a value");
    } else if (arg.startsWith("-")) {
      fail(`Unknown flag: ${arg}`);
    } else if (identifier === undefined) {
      identifier = arg;
    } else {
      fail(`Unexpected argument: ${arg}`);
    }
  }

  if (identifier === undefined) fail(`Missing required identifier.\n${inspectUsage}`);
  console.log(`identifier: ${identifier}\nverbose: ${verbose}\nformat: ${format ?? "(default)"}`);
}

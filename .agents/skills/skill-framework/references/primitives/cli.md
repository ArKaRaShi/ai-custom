# CLI Contract

Document each CLI's observable syntax and behavior; do not prescribe a parser API.

## Help and validation

- Top-level help and help for every exposed command or subcommand MUST succeed before validating required positional arguments. For example, `tool inspect --help` succeeds even when `inspect` normally requires an identifier.
- Missing required positional arguments fail for normal command execution.
- Unknown flags and missing option values fail by default. A value-taking option with no value MUST NOT be treated as a boolean flag or silently ignored.

## Declare option types

Every option MUST be declared as boolean or value-taking in the CLI's own syntax documentation.

- Boolean flags do not consume positional arguments. For example, `tool inspect --verbose item-7` sets `--verbose` and uses `item-7` as the identifier.
- Value-taking options require a value. The CLI documents whether it accepts separate and/or equals forms; do not assume one syntax implies the other. For example, a CLI may document both `--format json` and `--format=json`.

## Per-CLI syntax and exceptions

Document the actual invocation syntax for each CLI, including its commands, required positionals, flags, and accepted value-option forms. Do not treat an illustrative example as a universal parser API requirement.

Examples MUST match the implemented parser: do not show a supported form the
parser rejects, or omit a form the CLI claims to accept.

If a CLI intentionally differs from the defaults above, document the exact command or option and the reason for the exception. Exceptions are explicit and local; they do not change defaults for other commands or CLIs.

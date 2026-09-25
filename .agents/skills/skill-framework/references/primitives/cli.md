# CLI Contract

Document observable syntax and behavior for each CLI. Do not prescribe a parser API.

## Help and validation

- Top-level help and help for every exposed command or `subcommand` MUST succeed before validating required positional arguments. Running `tool inspect --help` succeeds even when `inspect` normally requires an identifier.
- Missing required positional arguments fail during normal command execution.
- Unknown flags and missing option values fail by default. The CLI MUST NOT treat a value-taking option with no value as a `boolean` flag or silently ignore it.

## Declare option types

Each CLI documents whether an option is `boolean` or value-taking.

- Boolean flags do not consume positional arguments. In `tool inspect --verbose item-7`, the flag sets `--verbose` and treats `item-7` as the identifier.
- Value-taking options require a value. The CLI documents whether it accepts separate forms, equals forms, or both. Do not assume one syntax implies the other. A CLI may document both `--format json` and `--format=json`.

## Per-CLI syntax and exceptions

Document actual invocation syntax for each tool, including its commands, required positional arguments, flags, and accepted value-option forms. Do not treat an illustrative example as a universal rule.

Examples MUST match the implemented parser: do not show a supported form the
parser rejects, or omit a form the CLI claims to accept.

If a command intentionally differs from the defaults above, document the exact command or option and the reason for the exception. Exceptions are explicit and local. They do not change defaults for other commands or tools.

## Safe-by-default mutations (preview by default, `--apply` to commit)

When a CLI command performs destructive mutations, file deletions, schema changes, or resource pruning:

- Default invocation MUST be a non-destructive preview. It inspects targets and reports planned actions without altering disk or remote state.
- Committing mutations requires an explicit flag such as `--apply` or `--confirm`.
- Tools MUST NOT mutate by default while requiring `--dry-run` to opt into safety. Safety is the baseline. Mutation is explicit.

## Standard Logging Contract (Dual-Mode: Tree Log + Machine JSON)

CLI tools in authored skills must use dual-mode logging:

1. **Human Default (Tree Log):**
   - Terminal invocations emit box-drawing tree logs (`├─`, `└─`, `│`) with context badges and status chips (`✔`, `✖`).
   - Every execution displays a provenance fingerprint (such as `project`, `env_file`, `base`, `target`, `status`).

2. **Machine Mode (`--format=json`):**
   - When callers pass `--format=json` or `--format json`, tools emit a JSON object to `stdout`.
   - The JSON object must contain at least `status`, `tool`, and `fingerprint`.
   - On failure, tools emit `{"status": "error", "error": "<message>"}` with a non-zero exit code.

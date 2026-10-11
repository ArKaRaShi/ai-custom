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

## Capped output and `--verbose`

A command that can print many items (findings, files, entries) caps the human tree output per group and reveals the rest with `--verbose`.

- Cap each group at a documented count, 15 by default. When a group hides items, its last line of the group says how many and names both `--verbose` and `--format=json`.
- `--verbose` is a `boolean` flag. It prints every item in the human output and changes nothing else: exit codes, summaries and JSON stay the same.
- `--format=json` always lists every item, with or without `--verbose`.
- Use the name `--verbose` for this behavior. Do not use `--all`, `--full` or `--long`. Reserve `--all` for flags that widen which targets a command acts on.
- Output that is always short does not need a cap or a flag.

Example from `markdown-quality`: `review.ts docs/ --verbose` lists every finding, while `review.ts docs/` prints 15 per check and ends with `... and 40 more (run with --verbose or --format=json to list every finding)`.

## Standard Logging Contract (Dual-Mode: Tree Log + Machine JSON)

CLI tools in authored skills must use dual-mode logging:

1. **Human Default (Tree Log):**
   - Terminal invocations emit box-drawing tree logs (`├─`, `└─`, `│`) with context badges and status chips (`✔`, `✖`).
   - Every execution displays a provenance fingerprint (such as `project`, `env_file`, `base`, `target`, `status`).

2. **Machine Mode (`--format=json`):**
   - When callers pass `--format=json` or `--format json`, tools emit a JSON object to `stdout`.
   - The JSON object must contain at least `status`, `tool`, and `fingerprint`.
   - On failure, tools emit `{"status": "error", "error": "<message>"}` with a non-zero exit code.

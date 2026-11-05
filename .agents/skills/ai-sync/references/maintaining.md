# Maintaining ai-sync

For changing ai-sync's own code, not for running it.

## Code layout

`scripts/sync.ts` is the entry point: it parses arguments, builds one `io` object (`io/io.ts`), runs one command, and renders the result. Code sits in `commands/` (one plain function per command, `(io, input) => output`), `lib/` (pure rules and the shared plan, scan, and manifest logic; functions that touch the machine take `io` first), `io/` (files, Git, shell, glob, prompts, progress output), and `render/` (argument parsing, help, and output rendering).

## Verification

Prerequisites are Bun 1.4 or later, `bun install --frozen-lockfile`, and running from the skill directory.

- `bun test tests/` exits 0.
- `bun run check` (type check, lint, format) exits 0.
- For workflow changes, run the relevant command against an isolated fixture with a temporary `HOME` and confirm previews leave files and Git state untouched. Report commands, results, and unchecked limits.
- `bun evals/harness.ts` backs the behavior scenarios. See `writing-skills/references/evaluating.md` to run them.

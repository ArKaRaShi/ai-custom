# Dependencies and Package Management

This skill uses an isolated `package.json` for pattern matching.

## Runtime Requirements

- **Runtime:** `bun` (v1.1.0 or newer).
- **Core modules:** uses native Node standard libraries (`node:fs`, `node:path`, `node:os`, `node:crypto`).

## External Dependencies

The root `package.json` contains:

```json
{
  "dependencies": {
    "ignore": "^7.0.10"
  }
}
```

The `ignore` package provides `.gitignore`-compliant path pattern matching for excluded and synced files.

## Installation

Install runtime dependencies inside the skill directory:

```bash
cd "$HOME/.agents/skills/ai-sync"
bun install
```

## Failure Recovery

If scripts fail with module resolution errors (e.g. `Cannot find package 'ignore'`):

1. **Verify Bun install:** ensure `bun` is available in `PATH` with `bun --version`.
2. **Reinstall dependencies:** run `bun install` inside `~/.agents/skills/ai-sync/`.
3. **Check lockfile:** ensure `bun.lock` exists beside `package.json`.

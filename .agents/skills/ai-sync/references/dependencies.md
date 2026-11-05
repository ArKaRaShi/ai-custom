# Dependencies and Package Management

The skill directory holds `package.json`, `bun.lock`, `tsconfig.json`, and `biome.json`, so the skill installs and checks its own tools.

## Runtime Requirements

- **Runtime:** `bun` 1.4 or later.
- **Core modules** use the Node standard libraries (`node:fs`, `node:path`, `node:os`, `node:crypto`, `node:child_process`).
- **Git:** `git` 2.38 or later on `PATH`. Remote preview uses `git merge-tree --write-tree`.

## Declared Packages and Justification

| Package | Kind | Why |
| --- | --- | --- |
| `ignore` ^7.0.10 | runtime | `.gitignore`-compliant matching for path rules in the shared manifest. |
| `typescript` 7.0.2 | dev | Type check (`bun run typecheck`). |
| `@types/bun` 1.4.2 | dev | Bun and Node type declarations for the type check. |
| `@biomejs/biome` 2.5.15 | dev | Lint and format check (`bun run lint`, `bun run format:check`). |

TypeScript 7 reads `paths` without `baseUrl`. The `@/*` alias maps to the skill root.

## Installation

```bash
cd "$HOME/.agents/skills/ai-sync"
bun install --frozen-lockfile    # restores the exact versions in bun.lock
# without Bun: pnpm install, or npm install
```

Run `bun install` without `--frozen-lockfile` only to change declared versions, then commit the new `bun.lock`. Never track `node_modules`.

## Verification commands

```bash
bun test tests/
bun run check                    # typecheck, lint, format check
bun run fix                      # explicit safe-fix and format
```

## Failure Recovery

| Signature | Fix |
| --- | --- |
| `Cannot find package 'ignore'` | Run `bun install --frozen-lockfile` in `~/.agents/skills/ai-sync/`. |
| `tsc: command not found` or `biome: command not found` | Same command: the dev tools install into `node_modules/.bin`. |
| `bun: command not found` | Install Bun 1.4 or later and confirm with `bun --version`. |
| Lockfile drift (`lockfile had changes`) | Confirm `bun.lock` sits beside `package.json`, then rerun with `bun install`. |

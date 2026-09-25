# Dependencies & Package Management

This skill uses native Bun runtime features and an isolated `package.json` for development types.

## Runtime Requirements

- **Runtime:** `bun` (v1.1.0 or newer).
- **Core modules:** uses native `bun:sqlite` and Node standard libraries (`node:fs`, `node:path`, `node:os`). Scripts do not require third-party runtime packages.

## Development Dependencies

The root `package.json` contains:

```json
{
  "devDependencies": {
    "@types/bun": "^1.3.14"
  }
}
```

## Installation

To install development type definitions locally:

```bash
cd "$HOME/.agents/skills/db-sandbox"
bun install
```

## Failure Recovery & Diagnostics

If scripts fail with module or type errors:

1. **Missing Bun binary:** verify Bun is in `PATH` with `bun --version`.
2. **SQLite runtime:** standard Bun releases include built-in SQLite support.
3. **Database client CLI binaries:**
   - PostgreSQL requires `psql` and `createdb` / `dropdb` installed locally.
   - MySQL requires `mysql` and `mysqladmin` installed locally.
   - SQLite does not require external CLI binaries. It runs embedded via `bun:sqlite`.

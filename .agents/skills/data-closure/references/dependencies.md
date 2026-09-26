# Dependencies & Package Management

This skill uses native Bun runtime features and an isolated `package.json` for development types.

## Runtime Requirements

- **Runtime:** `bun` (v1.1.0 or newer).
- **Core modules:** uses native Node standard libraries (`node:fs`, `node:path`, `node:os`, `node:crypto`). Scripts do not require third-party runtime packages.

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
cd "$HOME/.agents/skills/data-closure"
bun install
```

## Failure Recovery & Diagnostics

If scripts fail with module or type errors:

1. **Missing Bun binary:** verify Bun is in `PATH` with `bun --version`.
2. **Adapter execution failures:** verify that the specified `--adapter-runtime` (e.g. `bun` or python virtualenv) exists and is executable.
3. **Database access failures:** verify network reachability and credentials for target database hosts.

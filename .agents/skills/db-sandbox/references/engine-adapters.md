# DB Sandbox Engine Adapters & Internal Architecture

This reference explains internal engine drivers, registry resolution, and custom engine integration for `db-sandbox`.

## Directory Layout

```
db-sandbox/
  SKILL.md
  references/
    engine-adapters.md       # Engine drivers, registry structure, and extension guide
  scripts/
    sandbox.ts               # CLI: create / drop / list, --env-file resolution
    base.ts                  # Identifier normalization, guardrails, registry I/O
    test_sandbox.ts          # Runnable test suite: bun test
    package.json, tsconfig.json, bun.lock
    engines/
      postgres.ts            # PostgreSQL & TimescaleDB driver
      mysql.ts               # MySQL driver (mysqldump | mysql pipe)
      sqlite.ts              # SQLite driver (file-based cloning)
      index.ts               # Driver registry
```

## Registry Structure

The registry root defaults to `$XDG_STATE_HOME/db-sandbox/registry` (or `~/.local/state/db-sandbox/registry`).

Entries nest by composite key:
`<engine>/<host_port-or-"local">/<base>/<identifier>.env`

Each `.env` file records:

- `ENGINE`: engine name (postgres, mysql, sqlite)
- `SANDBOX_DB`: target sandbox database or file name
- `BASE`: source database or file path
- `PROJECT`: creator workspace path (`process.cwd()`)
- `HOST` / `PORT`: server address for network engines

## Supported Engine Drivers

### 1. PostgreSQL & TimescaleDB (`engines/postgres.ts`)

- **Standard PostgreSQL:** uses native `CREATE DATABASE <target> TEMPLATE <source>`.
- **TimescaleDB:** detects hypertable extension and uses logical dump/restore with `timescaledb_pre_restore()` and `timescaledb_post_restore()` hooks.
- **Bare Tier:** creates an empty target database without copying tables.

### 2. MySQL (`engines/mysql.ts`)

- **Full Tier:** streams tables and data via `mysqldump | mysql` pipeline.
- **Credentials:** managed via temporary defaults files.

### 3. SQLite (`engines/sqlite.ts`)

- **Full Tier:** fast file copy.
- **Bare Tier:** creates an empty `.db` file.

## Adding a Custom Engine Driver

To add a new database engine:

1. Create `scripts/engines/<name>.ts` with these driver methods:
   - `exists(conn, target): Promise<boolean>`
   - `create(conn, target, options): Promise<void>`
   - `drop(conn, target): Promise<void>`
   - `clone(conn, source, target, options): Promise<void>`
2. Export the driver in `scripts/engines/index.ts`.

All CLI flags, registry tracking, and guardrails remain engine-agnostic.

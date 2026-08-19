---
name: db-sandbox
description: Use when a task needs an isolated, disposable database clone to work against — parallel worktrees/branches touching migrations or data, notebook exploration, or any local change that must not corrupt a shared dev/base database. Symptoms this addresses: "which branch is this DB in", stale data after switching branches, migration conflicts against a shared local DB, fear of dropping the wrong database.
---

# DB Sandbox

## Overview

One disposable, named database clone per unit of work (branch, task, feature —
anything), so parallel work never shares mutable DB state, and so two repos
on the same machine never lose track of what the other created. Covers
create, list, and drop; not migrations, backups, or ad-hoc queries.

**Announce at start:** "I'm using the db-sandbox skill to <create/list/drop>
an isolated database clone."

## When to use

- Two pieces of work (branches, worktrees, tasks) need different DB state at
  the same time against the same server
- About to run migrations or destructive data changes and want a throwaway
  copy, not the shared local DB
- Reusing a sandbox from an earlier session for the same identifier

Don't use for: a single-developer, single-task local DB (just use it
directly) or anything touching a remote/prod host (the tool refuses that by
default — see Guardrails).

## Step 0: Confirm the Base

- `bun` on `PATH`. If missing, invoking the script fails immediately at the
  shell level — nothing to check in advance.
- The target engine's client binary on `PATH`: `mysql` + `mysqldump` for
  `mysql`, `psql` for `postgres`. `sqlite` needs neither (pure `node:fs`).
  A missing binary surfaces immediately as `command not found: <bin>`.
- A DB server already running and reachable at the resolved host:port.
  This skill never provisions infrastructure — no `docker compose up`, no
  container/service start, regardless of what's actually running the
  server (Docker, OrbStack, a native install, a remote port-forward). If
  nothing's listening, bring up the project's own stack first, separately.
- **MUST confirm the base database with the user before running `create`.**
  Never silently trust `--env-file`'s `DB_NAME`/`DB_PATH` (or any other
  default) as the right base. Use the `ask` tool and present the server's
  actual databases as choices — e.g. `SHOW DATABASES` (mysql), `\l` /
  `SELECT datname FROM pg_database` (postgres), or the candidate `.db`/
  `.sqlite3` files in the project — not free text, and not a guess.

## Step 1: Check Current State

**Before creating or dropping anything, check what's already registered for
this identifier.**

```bash
bun scripts/sandbox.ts <engine> list
bun scripts/sandbox.ts list   # whole machine, every engine
```

State "not registered" if new, or report the existing entry (engine, target,
base, origin project) if found. Skipping this is how duplicate-identifier
refusals and cross-project drop conflicts turn into surprises instead of
being caught before they happen.

## Step 2: Declare and Run

**MUST state the action and its resulting state before running `create` or
`drop`.** `list` alone needs no declaration, it's read-only.

- **Action** — the exact command: engine, identifier, base, and for `drop`
  whether `--force` applies.
- **Resulting state** — what will exist afterward. `create` is additive (new
  db/file, nothing else touched). `drop` is destructive (permanent delete +
  registry entry cleared).

```
Current state: no sandbox registered for 'ticket-4821' against myapp_dev.
Action: create sqlite sandbox 'ticket-4821' (full clone) from ./app.db.
Resulting state: new file app_ticket_4821.db added; nothing else changes.
```

```
Current state: sandbox 'ticket-4821' -> myapp_dev_ticket_4821, registered from ~/repos/backend.
Action: DESTRUCTIVE - dropping ticket-4821 with --confirm DROP.
Resulting state: myapp_dev_ticket_4821 permanently deleted; registry entry cleared.
```

```bash
# clone: full data copy (default) or --tier bare (schema/empty only, fast)
bun scripts/sandbox.ts <postgres|mysql|sqlite> create <identifier> --base <base-db-or-path> [--tier bare]

# destructive, requires literal --confirm DROP; --force true only needed to
# drop a sandbox another repo registered (see Guardrails)
bun scripts/sandbox.ts <engine> drop <identifier> --base <base-db-or-path> --confirm DROP
```

`<identifier>` is normalized before use (lowercased, non-alphanumeric runs
collapsed to `_`) — `feature-x` becomes `feature_x` in the target db/file
name, registry path, and `list` output. Pass whatever's convenient
(branch name, ticket number); the normalized form is what you'll see
reflected back everywhere else.

Connection resolves per field, in order: `--flag` > `--env-file` entry >
ambient `process.env` > built-in default. So a project agent can point
`--env-file` at that project's own `.env`/`.env.local` instead of restating
connection info as flags:

```bash
bun scripts/sandbox.ts mysql create feature-x --env-file .env.local
```

reads `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` from that
file (`DB_PATH` instead of `DB_NAME` for `sqlite`, since the "base" there is
a file path). Explicit `--host`/`--base`/etc always win over the file; the
file always wins over ambient env vars. For `sqlite`, connection flags
(`--host`/`--port`/`--user`/`--password`) don't apply — only `--base`/`DB_PATH`.

## Step 3: Verify and Report

- `create` prints `created: <name-or-path>` — confirm that value, and if the
  cloned data matters for the task, spot-check it (open the file / query the
  table) rather than assuming the clone succeeded.
- `drop` prints `dropped: <name-or-path>`, or a "pruned stale entry" message
  if the target was already gone (self-heal — not an error).
- Wire the confirmed value into whatever your project's own config expects
  (`.env` var, Django `DB_NAME`, etc). This tool does not write back to your
  project's env files; that's a follow-up step.

Report template:

```
Result: created demo_ticket_4821.db (tier=full)
Verified: 3 rows present in `widgets`
```

## Guardrails (non-negotiable, enforced in code not docs)

- **Local-only, unconditionally.** `create`/`drop` refuse any resolved host
  that isn't `localhost`/`127.0.0.1`/`::1`. No override flag exists — this
  tool must never be able to touch a remote/prod database.
- **Drop can only remove a normalized sandbox of the base**, never the base
  itself and never an unrelated database — `assertDroppable` in `base.ts`.
- **Drop requires literal `--confirm DROP`.** No default, no `-y`.
- **Create refuses to duplicate an already-registered identifier** instead of
  silently reusing or overwriting (unless the previous target was dropped
  outside the tool - see self-heal below) — check `list` first.
- **Drop refuses another project's sandbox.** The registry is shared across
  every repo on the machine (see Registry below), so a shared sandbox is
  also shared destructive access: `drop` compares the registered `PROJECT`
  cwd against the current one and requires `--force true` on a mismatch.
- **Stale entries self-heal, they don't stick forever.** If the registered
  target no longer exists in the database (dropped by hand, or a `create`
  that died mid-clone), `drop` prunes the entry and reports it instead of
  erroring "nothing to drop" and leaving the identifier permanently stuck;
  `create` prunes the same way before re-registering.
- **Failures surface real command output**, not Bun's generic
  `"Failed with exit code N"` — `errorMessage()` in `sandbox.ts` prefers
  `ShellError.stderr` (command-not-found, connection refused, auth
  failure, ...) over the opaque default message.

## Quick Reference

| Situation | Action |
|---|---|
| Identifier already registered | `create` refuses; reuse the printed `SANDBOX_DB` or pick a new identifier |
| Registered target deleted out-of-band (dropped by hand, crashed mid-clone) | `drop`/`create` self-heal (prune) automatically — not an error |
| Sandbox registered from another project's cwd | `drop` refuses; requires `--force true` |
| `drop` run without `--confirm DROP` | Refused; target survives |
| Postgres base has an open connection | `TEMPLATE` clone fails; close notebook/shell connections to the base first |
| Need to see sandboxes across every repo | `bun scripts/sandbox.ts list` (no engine positional) |
| Need schema-only, no data | `create ... --tier bare`, then run your project's migrations |
| DB server not reachable | Bring up the project's own stack first — this skill never provisions infrastructure |
| Base database unclear | `ask` the user with the server's actual database list — never guess from `--env-file` defaults |

## Common Rationalizations

| Excuse | Reality |
|---|---|
| "It's just a throwaway test, skip the declaration" | The declaration costs one line and is how a human catches a wrong base or identifier before a clone or drop actually runs — throwaway data doesn't make a wrong `drop` target throwaway |
| "I already know the base, skip confirming with the user" | Trusting `.env`'s default `DB_NAME`/`DB_PATH` is exactly the mistake this skill exists to prevent — confirm with `ask`, every time, before `create` |
| "`list` first is unnecessary, the identifier is obviously new" | Duplicate-refusal and cross-project registration exist because "obviously new" is often wrong across sessions, repos, and teammates on the same machine |
| "It errored once, `--force true` will fix it" | `--force` only overrides the cross-project ownership guard — it does nothing for a duplicate identifier or a missing target; self-heal (prune) handles the latter automatically, don't force past a guard that isn't the actual blocker |
| "The command output was truncated/odd, I'll assume it worked" | Confirm the printed `created:`/`dropped:` value in Step 3 — don't report success without reading it |

## Directory layout

```
db-sandbox/
  SKILL.md
  scripts/
    sandbox.ts           # CLI: create / drop / list, --env-file resolution
    base.ts                 # identifier normalization, guardrails, registry I/O
    test_sandbox.ts          # runnable self-check: bun scripts/test_sandbox.ts
    package.json, tsconfig.json, bun.lock   # @types/bun only, no runtime deps
    engines/
      postgres.ts             # CREATE DATABASE ... TEMPLATE (native clone, no dump/restore)
      mysql.ts                  # mysqldump | mysql pipe via Bun's shell, creds via temp defaults-file
      sqlite.ts                   # file copy, via bun:sqlite in tests
```

Registry root is a fixed per-user, per-machine location
(`$XDG_STATE_HOME/db-sandbox/registry`, default `~/.local/state/...`) — NOT
cwd-relative, so `list` sees every sandbox regardless of which repo invoked
the CLI. `--registry` overrides this (tests, CI isolation).

Entries nest by composite key - `<engine>/<host_port-or-"local">/<base>/<identifier>.env`
- so the same identifier used against two different engines, servers, or
base databases never collides. Each `.env` holds `ENGINE=`, `SANDBOX_DB=`,
`BASE=`, `PROJECT=` (the cwd that ran `create`), and `HOST=`/`PORT=` for
non-sqlite engines. `PROJECT` is what the cross-project drop guard checks
and what `list` prints, so a sandbox another repo created is visible with
its origin instead of being invisible or ambiguous.

## Adapting to a new engine

Implement `exists(conn, target)`, `create(conn, target)`, `drop(conn, target)`,
`clone(conn, source, target)` in a new `engines/<name>.ts`, register it in
`engines/index.ts`. Everything else (guardrails, registry, CLI, --env-file
resolution) is engine-agnostic and needs no changes.

## Known limits

- Postgres `TEMPLATE` clone fails if another session holds a connection to
  the base database — close notebook/shell connections first.
- Cross-repo visibility works (`list` is shared machine-wide), but reuse is
  still manual: `create` errors on a duplicate identifier rather than
  silently reusing one. Check `list` and reuse the printed `SANDBOX_DB`
  value yourself if you want that.
- No migration runner included — after `--tier bare`, run your project's own
  migrations against the new sandbox.
- `--env-file` uses a minimal `KEY=VALUE` parser (comments, quoted values);
  no variable expansion or multiline values.

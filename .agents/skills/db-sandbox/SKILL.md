---
name: db-sandbox
description: Use when a task needs an isolated, disposable database clone to work against — parallel worktrees/branches touching migrations or data, notebook exploration, or any local change that must not corrupt a shared dev/base database. Symptoms this addresses: "which branch is this DB in", stale data after switching branches, migration conflicts against a shared local DB, fear of dropping the wrong database.
---

# DB Sandbox

One disposable, named database clone per unit of work (branch, task, or feature) so parallel work never shares mutable database state. Covers `create`, `list`, and `drop`.

**Announce at start:** "I'm using the db-sandbox skill to <create/list/drop> an isolated database clone."

## When to Use

- Two branches or tasks need different database states concurrently on the same machine.
- Running migrations or destructive data changes on a throwaway copy.
- Reusing an existing sandbox from an earlier session.

**When NOT to use:** single-developer local workflows or remote/production hosts (the tool strictly refuses non-localhost hosts).

## Quick Reference

```bash
SKILL_DIR="${SKILL_DIR:-$HOME/.agents/skills/db-sandbox}"

# 1. List sandboxes (current engine or whole machine)
bun "$SKILL_DIR/scripts/sandbox.ts" <postgres|mysql|sqlite> list
bun "$SKILL_DIR/scripts/sandbox.ts" list

# 2. Create sandbox (full data copy or --tier bare for schema only)
bun "$SKILL_DIR/scripts/sandbox.ts" <postgres|mysql|sqlite> create <identifier> --base <base-db-or-path> [--tier bare]

# 3. Drop sandbox (destructive, requires explicit --confirm DROP)
bun "$SKILL_DIR/scripts/sandbox.ts" <engine> drop <identifier> --base <base-db-or-path> --confirm DROP
```

For engine internals and adapter mechanics, see [references/engine-adapters.md](references/engine-adapters.md).

## Workflow

### Step 0: Confirm Base Database

- Verify DB server is reachable on `localhost`.
- **Confirm the base database with the user before creating.** Use the `ask` tool with actual server databases (`SHOW DATABASES` or `\l`), never guess from `.env`.

### Step 1: Check Current State

Before creating or dropping, inspect registered sandboxes:

```bash
bun "$SKILL_DIR/scripts/sandbox.ts" <engine> list
```

### Step 2: Declare and Run

State the action and resulting state before running:

```text
Current state: no sandbox registered for 'ticket-4821' against myapp_dev.
Action: create sqlite sandbox 'ticket-4821' (full clone) from ./app.db.
Resulting state: new file app_ticket_4821.db added; nothing else changes.
```

Run the creation command:

```bash
bun "$SKILL_DIR/scripts/sandbox.ts" mysql create feature-x --env-file .env.local
```

### Step 3: Verify and Report

- `create` prints `created: <name-or-path>`. Verify table contents or file existence.
- `drop` prints `dropped: <name-or-path>`.

```text
Result: created demo_ticket_4821.db (tier=full)
Verified: 3 rows present in widgets
```

## Guardrails (Code-Enforced)

- **Local-Only:** strictly refuses any host that is not `localhost` / `127.0.0.1` / `::1`.
- **Drop Safety:** can only remove a normalized sandbox of the base, never the base itself (`assertDroppable`).
- **Confirmation Required:** `drop` requires literal `--confirm DROP`.
- **No Overwrite:** `create` refuses to silently overwrite an existing identifier.
- **Cross-Project Ownership Guard:** `drop` requires `--force true` if invoked from a different workspace directory.
- **Self-Healing:** stale or manually deleted databases are pruned automatically from registry.

## Common Rationalizations

| Excuse | Reality |
| --- | --- |
| "Skip the declaration for throwaway tests" | The declaration prevents accidental drops and confirms the target before mutation. |
| "I already know the base database" | Never guess `.env` defaults. Confirm with `ask` before cloning. |
| "`list` first is unnecessary" | Duplicate checks avoid collision across branches and teammates on the same machine. |
| "Force will fix my error" | `--force` only overrides the cross-project ownership guard; it does not bypass missing targets. |
| "Assume the command worked" | Always verify the printed `created:` or `dropped:` output before reporting success. |

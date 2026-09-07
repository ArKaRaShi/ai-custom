---
name: isolated-worktree
description: Use when creating an isolated Git worktree for feature development, experimentation, subagents, or testing while leaving the parent checkout and branch untouched. Never merges back automatically.
---

# Isolated Worktree

Create and bootstrap one or more isolated sibling worktrees for independent feature development, experimentation, or subagent tasks. The parent checkout stays unchanged; integration is a later, explicit user choice.

## Invariants

- One feature, branch, worktree, and mutable resource namespace per unit of work.
- Never stash, commit, reset, merge, rebase, push, or delete to make setup easier.
- Never create a worktree inside another worktree (sibling directories only).
- Never silently include uncommitted parent changes in a new branch.
- Never start parallel services until ports, databases, environments, caches, and container names are distinct or the project explicitly permits sharing.
- Never merge back into the parent branch automatically.
- Never remove a worktree or branch unless the user explicitly asks.

If two tasks must share uncommitted files, they are not independent worktrees; commit a shared base or use a different workflow.

## Workflow

### 1. Preflight

Announce that an isolated workspace is being prepared. Read repository instructions, setup recipes, and runtime documentation before choosing commands.

Detect the current repository and isolation with:
```bash
git worktree list --porcelain
git rev-parse --git-dir
git rev-parse --git-common-dir
git branch --show-current
```

Treat a linked worktree as a starting point, not permission to nest another worktree inside it. Choose and state the base worktree and base ref explicitly.

If the base worktree is dirty, leave it exactly as-is. Branch new worktrees from its current `HEAD`, and state that uncommitted changes are excluded. Ask before using any WIP as a shared base.

### 2. Plan the Worktree

Determine:

| Field | Rule |
|---|---|
| Feature / Slug | User-provided slug or concise derived name |
| Branch | Unique branch; follow repository convention |
| Path | Sibling of the base worktree by default (e.g. `../repo-slug/`), never nested |
| Base | Explicit ref (e.g. `HEAD` or default branch) |
| Setup | Repository-provided command or recipe (npm, cargo, poetry, etc.) |
| Resources | Worktree-scoped env, ports, DB, cache, and services |

Check existing worktree paths and branches before creating anything. Reuse an existing matching worktree only when the user asks for reuse; never overwrite or silently repoint it.

### 3. Create Worktree

Use Git's worktree mechanism from the chosen base context:

```bash
git worktree add -b <branch> <sibling-path> <base-ref>
```

### 4. Bootstrap Independently

Run setup commands with that worktree as the actual `cwd`. Prefer the repository's `AGENTS.md`, recipe, Makefile, or documented setup command:

```bash
cd <sibling-path>
# Run detected project setup (e.g., bun install / npm install / pip install)
```

Each worktree must have its own mutable state where concurrent execution is needed:
- **Environment/config:** separate files or namespaces; never symlink mutable env files.
- **Ports:** distinct values for every server and sidecar.
- **Database:** separate database/schema/container or a safe sandbox (e.g. `db-sandbox`).
- **Caches/build outputs:** separate unless demonstrably read-only.
- **Containers/networks:** distinct project/container/network names.

If the repository gives no safe resource-isolation rule, create the worktree but report that concurrent service execution requires manual port/db configuration.

### 5. Handoff

Pass the absolute path as `cwd` to the developer or subagent. Return a status summary:

```text
Feature: <slug>
Branch: <branch>
Worktree: <absolute-path>
Parent changed: no
Merge/rebase performed: no
Push/PR performed: no
```

### 6. Failure and Teardown

- If setup fails, report the failed step. Do not automatically roll back or delete.
- Teardown is explicit and ordered: stop project processes, remove per-worktree resources, check for uncommitted changes, then run `git worktree remove <path>`.
- Never delete branches automatically.

## Common Rationalizations

| Excuse | Reality |
|---|---|
| "Clean the parent first." | Do not stash, commit, or reset user work; branch from `HEAD` and report excluded WIP. |
| "Use the current worktree as the parent." | Inspect all worktrees and choose a base explicitly; never nest. |
| "Merge back after finishing." | Never merge or rebase automatically; integration is an explicit user choice. |
| "The services can share ports or a DB." | Prove safe namespacing first; otherwise do not run them concurrently. |
| "Copy the parent `.env`." | Only a project recipe may copy secrets; mutable config must remain worktree-scoped. |
| "Delete the worktree when done." | Preserve all work; require explicit user instruction to tear down. |

## Output Contract

For execution, return path, branch, setup status, resource-isolation status, and the explicit statement:
`Parent changed: no | Merge/rebase performed: no | Push/PR performed: no`.

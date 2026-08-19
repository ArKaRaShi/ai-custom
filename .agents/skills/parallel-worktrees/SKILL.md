---
name: parallel-worktrees
description: Use when a user wants multiple independent features, agents, or branches developed concurrently in isolated Git worktrees while leaving the parent checkout untouched. Do not use for one feature or work that must share uncommitted files.
---

# Parallel Worktrees

Create and bootstrap one isolated sibling worktree per independent feature. The parent checkout stays unchanged; integration is a later, explicit choice.

## Invariants

- One feature, branch, worktree, and mutable resource namespace per unit of work.
- Never stash, commit, reset, merge, rebase, push, or delete to make setup easier.
- Never create a worktree inside another worktree.
- Never silently include uncommitted parent changes in a new branch.
- Never start parallel services until ports, databases, environments, caches, and container names are distinct or the project explicitly permits sharing.
- Never remove a worktree or branch unless the user explicitly asks.

For one feature, use `using-git-worktrees` instead. If two features must share uncommitted files, they are not independent worktrees; commit a shared base or use a different workflow.

## Workflow

### 1. Preflight

Announce that isolated parallel workspaces are being prepared. Read repository instructions, setup recipes, and runtime documentation before choosing commands.

Detect the current repository and isolation with `git worktree list --porcelain`, `git rev-parse --git-dir`, `git rev-parse --git-common-dir`, and `git branch --show-current`. Treat a linked worktree as a starting point, not permission to nest another worktree inside it. Choose and state the base worktree and base ref explicitly.

If the base worktree is dirty, leave it exactly as-is. By default, branch new worktrees from its current `HEAD`, and state that uncommitted changes are excluded. Ask before using any WIP as a shared base.

### 2. Plan the worktree matrix

For each feature, determine:

| Field | Rule |
|---|---|
| Feature | User-provided slug or concise derived name |
| Branch | Unique branch; follow repository convention |
| Path | Sibling of the base worktree by default, never nested |
| Base | One explicit ref for all independent features unless stacking is requested |
| Setup | Repository-provided command or recipe |
| Resources | Worktree-scoped env, ports, DB, cache, and services |

Check existing worktree paths and branches before creating anything. Reuse an existing matching worktree only when the user asks for reuse; never overwrite or silently repoint it. Do not fetch, create remote branches, or edit `.gitignore` without explicit need and approval.

### 3. Create worktrees

Use a native worktree facility when the harness provides one. Otherwise use Git’s worktree mechanism once per feature, from the chosen base context:

```bash
git worktree add -b <branch> <sibling-path> <base-ref>
```

Create independent worktrees only after the shared preflight. Creation may run in parallel after paths and branches are validated.

### 4. Bootstrap independently

Run each setup command with that worktree as the actual `cwd`. Prefer the repository’s `AGENTS.md`, recipe, Makefile, Justfile, or documented setup command. Do not guess a framework-specific install command and do not blindly copy environment files or secrets.

Each worktree must have its own mutable state where the project needs concurrent execution:

- Environment/config: separate files or namespaces; never symlink mutable env files.
- Ports: distinct values for every server and sidecar.
- Database: separate database/schema/container/volume or a documented safe sandbox.
- Caches/build outputs: separate unless demonstrably read-only and content-addressed.
- Containers/networks: distinct project/container/network names.
- Dependency environments: separate when the toolchain or project instructions require it.

If the repository gives no safe setup or resource-isolation rule, create the worktrees but do not claim that they are ready to run simultaneously. Report the missing adapter.

### 5. Handoff

Assign one agent or session to one worktree and pass its absolute path as `cwd`. Never let two agents share a worktree. Return a status table:

```text
Feature | Branch | Worktree | Setup | Resources | Status
```

State explicitly:

```text
Parent changed: no
Merge/rebase performed: no
Push/PR performed: no
```

### 6. Failure and teardown

If one creation or setup fails, keep successful worktrees, report the failed step, and retry only the failed unit. Do not automatically roll back successful units.

Teardown is explicit and ordered: stop project processes, remove per-worktree resources, check for uncommitted changes, then run `git worktree remove`. Never delete branches automatically.

## Common rationalizations

| Excuse | Reality |
|---|---|
| “Clean the parent first.” | Do not stash, commit, or reset user work; branch from `HEAD` and report excluded WIP. |
| “Use the current worktree as the parent.” | Inspect all worktrees and choose a base explicitly; never nest. |
| “The default branch is obvious.” | State the exact base ref; ask when it changes the result. |
| “The services can share ports or a DB.” | Prove safe namespacing first; otherwise do not run them concurrently. |
| “Copy the parent `.env`.” | Only a project recipe may copy secrets; mutable config must remain worktree-scoped. |
| “Delete failed worktrees automatically.” | Preserve successful work and require explicit cleanup. |

## Output contract

For a plan, return the worktree matrix and unresolved decisions without changing files. For execution, return paths, branches, setup status, resource-isolation status, and the unchanged-parent/no-integration statement. Never claim a workspace is ready without the project’s baseline check or an explicit explanation of why setup could not be verified.

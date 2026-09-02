# parallel-worktrees

Create several independent Git worktrees for concurrent feature work while leaving the parent checkout untouched.

## Use it for

- Multiple independent features developed at the same time.
- One coding agent or session per feature.
- Separate branches and sibling directories.
- Projects whose local instructions define environment, database, port, or service setup.

For one feature, use `using-git-worktrees`. For commit integration, use an explicit branch/PR workflow later.

## Guarantees

- One branch and worktree per feature.
- Parent working files and index are not changed.
- No automatic stash, commit, reset, merge, rebase, push, branch deletion, or worktree deletion.
- No concurrent services are started until mutable resources are isolated or the project explicitly permits sharing.
- Existing worktrees and branch collisions are reported instead of overwritten.

The worktrees share Git objects, but each has an independent working directory and index. Uncommitted files in the parent are not copied into new worktrees. If features need to share uncommitted changes, use a committed shared base or another workflow.

## Typical layout

```text
repo/
../repo-orders-retry/
../repo-sensor-filter/
../repo-api-pagination/
```

Each sibling maps to one feature branch:

```text
Feature          Branch                    Path
orders retry     feature/orders-retry      ../repo-orders-retry
sensor filter    feature/sensor-filter     ../repo-sensor-filter
API pagination   feature/api-pagination    ../repo-api-pagination
```

## Project setup

The skill reads repository instructions before running setup. It does not assume Django, Node, Python, Docker, or any database engine. A repository recipe may define:

- Environment-file handling.
- Dependency installation.
- Per-worktree ports.
- Database or schema sandboxes.
- Container and network names.
- Baseline checks.

Without a project-specific isolation rule, the worktrees can still be created, but they are not reported as safe to run concurrently.

## Cleanup

Cleanup is explicit. Stop project processes, remove per-worktree resources, check for uncommitted changes, then remove the worktree. Branches are never deleted automatically.

## See also

- [`SKILL.md`](./SKILL.md) — agent-facing workflow and safety rules.
- [`using-git-worktrees`](../using-git-worktrees/) — single-worktree setup.

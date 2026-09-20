# isolated-worktree

Create and bootstrap isolated sibling worktrees for feature development, experimentation, or subagents.

The parent checkout stays unchanged; integration is a later, explicit user choice.

## Invariants

- Sibling directories only (`../repo-slug/`), never nested.
- Parent working tree is completely untouched.
- No automatic merging, rebasing, or pushing.
- Worktree and branch are never deleted without explicit user request.

---
name: ai-sync
description: Syncing local agent config with a git backup. Use when pushing, pulling, retiring a skill, tracking files, or resolving conflicts in ~/.omp or ~/.agents/skills.
---

# ai-sync

Moves files between the configured local roots and the git backup repository. Every change gets a preview, an approval, then an apply.

## Steps

1. Define the shell helper. Exit: `sync status "$REPO"` runs without error.

   ```bash
   SKILL_DIR="${SKILL_DIR:-$HOME/.agents/skills/ai-sync}"
   REPO="$HOME/Disk/ai-custom"
   sync() { bun "$SKILL_DIR/scripts/sync.ts" "$@"; }
   ```

2. Pick the command and scope from the table. Exit: you have written down the command and its `--target`.

   | Goal | Command |
   | --- | --- |
   | Back up local changes (add `--remove-stale` to also remove backup files with no local file) | `sync push "$REPO" --target <scope> [--remove-stale] [--git-push]` |
   | Restore from the backup | `sync pull "$REPO" --target <scope> [--git-pull]` |
   | Remove deleted skills from the backup (add `--git-push` to remove them from the remote too) | `sync retire <skill...> --root agents [--git-push]` |
   | Remove a backup copy of a file the policy already excludes | `sync prune "$REPO" --target <root>:<path>` |
   | Track or untrack files and skills | `sync track` or `sync untrack`, see [commands](references/commands.md) |
   | See what differs | `sync status "$REPO"` or `sync diff "$REPO"` |

3. Run that command without `--apply`. Exit: the command prints a preview and nothing changed.
4. Show the user the actions, errors, and Git facts from the preview, then stop and ask for approval of exactly that scope. Exit: the user approved that scope. When no one can answer, end the run by stating the command you would run next.
5. Rerun the command with `--apply`. Exit: the outcome is `success`.
6. After a nonzero exit, read `errors` and `recovery`, then return to step 3. Completed actions stay in place, because ai-sync does not roll back. Exit: you show a fresh preview.

## Backup repository access

Use the bundled `sync.ts` for every operation that changes the backup repository. Edit files in the configured local roots, not in the backup repository. Never edit, copy, or redirect files into the backup repository, and never run a Git command that writes to it (`git pull`, `git add`, `git commit`, `git push`, `git checkout`, `git reset`, `git stash`).

Read-only Git commands are fine for diagnosis, such as when a preview reports `GIT_DIRTY_UNRELATED` or `GIT_CONFLICT`: `git status`, `git diff`, `git log`, `git show`, `git branch`, `git remote -v`, `git ls-files`. Report what they find, then let the user decide how to resolve it.

## Where to read more

| Case | Read |
| --- | --- |
| Setup, tracking, retiring, command forms, targets, saved plans | [commands](references/commands.md) |
| Error codes and the JSON result | [errors](references/errors.md) |
| Pulling or pushing through Git, simulation limits | [git-remote](references/git-remote.md) |
| Installers, discovery, conflicts, migration | [bootstrap](references/bootstrap.md) |
| Installing tools, supported versions, install failures | [dependencies](references/dependencies.md) |
| Changing ai-sync's own code | [maintaining](references/maintaining.md) |

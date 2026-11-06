# One repo copy; each Mac links into it

Status: accepted

Authored skills and OMP files live only in the ai-custom repo, and each Mac's folders are symlinks into its clone. This replaces ai-sync, which kept a second copy per Mac and reconciled the two with a manifest, drift states and per-command scopes.

The two-copy model produced orphans (a renamed skill left its old folder behind on one Mac), a manifest that every change had to touch, and sessions spent reconciling state instead of editing. One copy makes rename, delete and conflict ordinary git operations.

## Considered options

- **Keep ai-sync and add rename and orphan cleanup.** It preserves the saved-plan flow and the JSON result contract, but it keeps two copies and the manifest.
- **Symlink the repo, with a per-Mac skip list (chosen).** No manifest exists. A skill counts as authored when its folder is in the repo, and a Mac opts out through `skip.txt`.
- **Symlink whole folders.** This is simpler, but runtime state in the OMP folder would end up in git.

## Consequences

- Every Mac links authored items by default. A Mac opts out through its skip list.
- External skills stay per Mac, and `externals.txt` reinstalls them after approval.
- A broken or moved clone breaks every link until you run `install.sh --apply` again.
- Tools that replace a link with a plain file (an editor saving by rename) detach that item. The next preview reports it as a conflict.
- Saved plans and the JSON result envelope no longer exist. The installer previews by default instead.

# Bootstrap, discovery, conflicts

Install absent external skills, record unlisted ones, and resolve conflicting files.

## Discovery and installers

```bash
sync discover "$REPO"        # report candidates only
sync discover "$REPO" --write # record candidates as sync: false
sync bootstrap "$REPO" [--format=json]                          # review only: pending installers with commands and hashes
sync bootstrap "$REPO" --approve-install agents:archify@3f2a9c1d7b04  # run only the approved installer (repeatable)
```

Bootstrap lists absent external skills marked `sync: false` with their installer commands. Each command is shown with a 12-character hash, the start of the SHA-256 of the exact command string. Show the exact commands to the user, then rerun with `--approve-install <root>:<skill>@<hash>` for each one they approve. A command runs only when its flag is present, and every approval is checked before anything runs. A hash that no longer matches fails with `PLAN_STALE_POLICY`, and a token without a hash fails with `PLAN_INVALID`. In both cases bootstrap skips every installer, and the recovery text gives the current token to review. A skill with an empty installer and source is reported for manual installation.

## Migration and conflicts

Installations with v1 manifests need one `migrate-v2` run from the ai-sync checkout. A validation failure leaves the sources unchanged. Test with an isolated `HOME`. Runtime accepts only the v2 manifest. The old positional `track <skill> <origin>` and `untrack <skill>` forms, `prune-manifest`, and `migrate-manifest` are removed.

`ours` means the local file. `theirs` means the repository file. `merge` uses a plain three-way text merge. Preserve non-conflicting changes and get user approval before replacing a conflicted result with a synthesized version.

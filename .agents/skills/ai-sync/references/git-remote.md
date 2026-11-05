# Git remote workflow

Remote preview never touches the backup repository's refs, index, working tree, or config. It fetches into a disposable repository and simulates the integration. Then it removes that repository.

1. `sync pull "$REPO" --target <scope> --git-pull` previews `git.incoming` (add, modify, delete), `git.conflicts`, and any blocker. A blocked preview exits nonzero with every action `not_attempted`.
2. With the user's approval, `sync pull "$REPO" --apply --target <scope> --git-pull` pulls exactly what was previewed, then restores. A failed pull or conflict stops before any restore.
3. `sync pull ... --git-pull --plan-out plan.json` saves the remote commit and local Git state. `sync apply plan.json --apply` checks again that the remote commit, HEAD, and pending changes match, then pulls, then restores. A moved remote or changed local state fails with `GIT_REMOTE_ADVANCED` or `GIT_DIRTY_UNRELATED` and restores no files. A plan whose restore actions read files the pull changes is refused with `GIT_SIMULATION_FAILED`; apply directly instead.
4. `sync push "$REPO" --target <scope> --git-push` previews `git.exportedPaths` and `git.unrelatedChanges`. Any unrelated staged, unstaged, or untracked change blocks with `GIT_DIRTY_UNRELATED` and lists the paths.
5. `sync push "$REPO" --apply --target <scope> --git-push [-m "msg"]` runs that pre-flight before exporting, stages and commits only the exported paths, then pushes. Ask first: "Backup export complete. Commit and push to the git remote?" `--git-push` with `--plan-out` fails with `PLAN_INVALID`.

Simulation proceeds only with `pull.rebase` unset or false, `pull.ff` unset or `only`, no `core.hooksPath`, `filter.*`, `.gitmodules`, sparse checkout, shallow clone, or `core.autocrlf` other than unset or false, and one named remote. Otherwise it reports `GIT_UNSUPPORTED_CONFIG`. Plans store a hash of the remote URL, never the URL.

---
name: ai-sync
description: Use when synchronizing, auditing, resolving conflicts, or deploying custom OMP extensions, task agents, rules, hooks, configs, and agent skills between your local environment and git backup.
---

# `ai-sync`

Synchronize configured local roots with a git backup repository. The repository stores shared policy in `.ai-sync/manifest.json`. Each machine records its root bindings in `~/.config/ai-sync/locations.json`.

## Setup

```bash
SKILL_DIR="${SKILL_DIR:-$HOME/.agents/skills/ai-sync}"
REPO="$HOME/Disk/ai-custom"
sync() { bun "$SKILL_DIR/scripts/sync.ts" "$@"; }

sync init "$REPO"                                          # once; never overwrites a manifest
sync root add omp --kind path --repo-root .omp
sync root add agents --kind skill --repo-root .agents/skills
sync root bind omp --local-root ~/.omp/agent               # this machine only
sync root bind agents --local-root ~/.agents/skills
```

`root add` changes shared policy. `root bind` changes only this machine's locations file. Missing or invalid bindings abort transfers before any copy.

## Track

```bash
sync track path extensions --root omp --sync               # last matching rule wins
sync track path extensions/orca-* --root omp --no-sync
sync track skill mentor --root agents --origin authored    # sync defaults true
sync track skill archify --root agents --origin external \
  --from tt-a1i/archify --source-type github --version 2.17.0 \
  --install 'npx -y skills add tt-a1i/archify -g' --no-sync
sync untrack path extensions/orca-* --root omp             # records an exclusion
sync untrack skill mentor --root agents                    # removes policy only
```

Path roots are default-deny: only matching `sync: true` rules transfer. Skill roots use exact entries. Re-tracking a skill keeps recorded `--from`, `--source-type`, `--version`, `--install`, and `--description` unless a flag replaces them. Disabling sync or removing tracking never deletes files.

## Workflow: preview, approve, apply, recover

1. Preview: `sync push "$REPO" --target <scope>` or `sync pull ...` (gate: a preview leaves files and Git state untouched).
2. Show the user the exact actions, errors, and Git facts from the preview.
3. Get approval (gate: approval covers exactly that scope).
4. Apply: rerun with `--apply --target <scope>`, or save with `--plan-out plan.json`, then `sync apply plan.json --apply`.
5. Recover: after a nonzero exit, read `errors` and `recovery`, run a fresh preview, and ask again. Completed actions stay in place. ai-sync does not roll back.

| Command | Effect |
| --- | --- |
| `status`, `diff`, `inspect` | read only |
| `push`, `pull` | preview; `--apply` needs a bounded `--target` |
| `prune` | preview excluded backup copies; `--apply --target` removes only those |
| `apply plan.json` | recheck the saved plan; `--apply` executes it |
| `discover`, `bootstrap` | read only unless `--write` or `--approve-install` |

```bash
sync push "$REPO" --target omp --plan-out plan.json   # keep the file outside the backup and managed roots
sync apply plan.json                                  # recheck only
sync apply plan.json --apply                          # stale plans are rejected; nothing changes
sync inspect "$REPO" [--target <scope>]               # kind, root, path, shared|local-only, version or null, local path
sync prune "$REPO"                                    # list; local files and unselected backup content stay untouched
sync prune "$REPO" --apply --target omp:old/skill.md  # remove exact backup copies only
```

`--target` is repeatable and matches exactly or by glob, never by substring: a root id, a skill name, a root-relative path, `<root>:<path>`, or a glob. `--exclude <pattern>` filters relative paths.

`apply` takes only a plan file. It recomputes scope, policy, bindings, and every source and target fingerprint, and rejects the plan on any change. A concurrent change during apply fails that action, marks later actions `not_attempted`, and reports `partial`. Pruning removes working-tree copies only; Git history and remote copies keep earlier versions.

## Result envelope and error codes

`--format=json` prints `{operation, scope, actions, outcome, errors, recovery}` plus `git` or `items` when relevant. `outcome` is `preview`, `success`, `partial`, or `failed`; failures exit nonzero. Each action is `proposed`, `completed`, `failed`, or `not_attempted`.

| Code | Meaning |
| --- | --- |
| `EMPTY_SCOPE`, `BROAD_SCOPE`, `UNKNOWN_TARGET` | target selection is empty, unbounded for `--apply`, or unknown |
| `PLAN_INVALID`, `PLAN_STALE_SCOPE`, `PLAN_STALE_POLICY`, `PLAN_STALE_SOURCE`, `PLAN_STALE_TARGET` | the plan is malformed or no longer matches current state |
| `PATH_ESCAPE`, `SYMLINK_UNSUPPORTED` | a path leaves its root, or a symlink would be followed |
| `GIT_DIRTY_UNRELATED`, `GIT_REMOTE_ADVANCED`, `GIT_CONFLICT` | Git state blocks the step |
| `GIT_UNSUPPORTED_CONFIG`, `GIT_SIMULATION_FAILED`, `GIT_FAILED` | Git cannot be simulated or the command failed |
| `IO_FAILED` | a file operation failed |

## Backup Repository Access

Use the bundled `sync.ts` entrypoint for every operation on the backup repository. Edit files in configured local roots, not in the backup repository. Never edit, copy, or redirect files into the backup repository, and never run Git commands against it directly (`git pull`, `git add`, `git commit`, `git push`). Do not bypass the script when a direct operation seems faster or the user approves a Git command.

## Git remote workflow

Remote preview never touches the backup repository's refs, index, working tree, or config. It fetches into a disposable repository, simulates the integration, and removes it.

1. `sync pull "$REPO" --target <scope> --git-pull` previews `git.incoming` (add, modify, delete), `git.conflicts`, and any blocker. A blocked preview exits nonzero with every action `not_attempted`.
2. With the user's approval, `sync pull "$REPO" --apply --target <scope> --git-pull` pulls exactly what was previewed, then restores. A failed pull or conflict stops before any restore.
3. `sync pull ... --git-pull --plan-out plan.json` saves the remote commit and local Git state. `sync apply plan.json --apply` checks again that the remote commit, HEAD, and pending changes match, then pulls, then restores. A moved remote or changed local state fails with `GIT_REMOTE_ADVANCED` or `GIT_DIRTY_UNRELATED` and restores no files. A plan whose restore actions read files the pull changes is refused with `GIT_SIMULATION_FAILED`; apply directly instead.
4. `sync push "$REPO" --target <scope> --git-push` previews `git.exportedPaths` and `git.unrelatedChanges`. Any unrelated staged, unstaged, or untracked change blocks with `GIT_DIRTY_UNRELATED` and lists the paths.
5. `sync push "$REPO" --apply --target <scope> --git-push [-m "msg"]` runs that pre-flight before exporting, stages and commits only the exported paths, then pushes. Ask first: "Backup export complete. Commit and push to the git remote?" `--git-push` with `--plan-out` fails with `PLAN_INVALID`.

Simulation proceeds only with `pull.rebase` unset or false, `pull.ff` unset or `only`, no `core.hooksPath`, `filter.*`, `.gitmodules`, sparse checkout, shallow clone, or `core.autocrlf` other than unset or false, and one named remote. Otherwise it reports `GIT_UNSUPPORTED_CONFIG`. Plans store a hash of the remote URL, never the URL.

## Bootstrap and discovery

```bash
sync discover "$REPO"        # report candidates only
sync discover "$REPO" --write # record candidates as sync: false
sync bootstrap "$REPO" [--format=json]                          # review only: pending installers with commands and hashes
sync bootstrap "$REPO" --approve-install agents:archify@3f2a9c1d7b04  # run only the approved installer (repeatable)
```

Bootstrap lists absent external skills marked `sync: false` with their installer commands. Each command is shown with a 12-character hash, the start of the SHA-256 of the exact command string. Show the exact commands to the user, then rerun with `--approve-install <root>:<skill>@<hash>` for each one they approve. A command runs only when its flag is present, and every approval is checked before anything runs. A hash that no longer matches fails with `PLAN_STALE_POLICY`, and a token without a hash fails with `PLAN_INVALID`. In both cases bootstrap skips every installer, and the recovery text gives the current token to review. A skill with an empty installer and source is reported for manual installation.

## Migration and conflicts

Installations with v1 manifests need one `migrate-v2` run from the ai-sync checkout; a validation failure leaves the sources unchanged. Test with an isolated `HOME`. Runtime accepts only the v2 manifest; the old positional `track <skill> <origin>` and `untrack <skill>` forms, `prune-manifest`, and `migrate-manifest` are removed.

`ours` means the local file. `theirs` means the repository file. `merge` uses a plain three-way text merge. Preserve non-conflicting changes and get user approval before replacing a conflicted result with a synthesized version.

## Code layout

`scripts/sync.ts` is the entry point and `scripts/container.ts` wires it. Code sits in `domain/` (pure rules and types), `application/` (interfaces, services, one-class use cases), `infrastructure/` (files, Git, shell, glob), and `presentation/` (arguments and rendering). The layer guard enforces the import rules.

## Verification

Prerequisites: Bun 1.4 or later; install with `bun install --frozen-lockfile`; run from this skill directory. **REQUIRE SUBSKILL:** `markdown-quality`. If unavailable, check frontmatter, structure, and local links manually and report that the automated review was unavailable.

- `bun test tests/` exits 0.
- `bun run check` (type check, lint, format) exits 0.
- `bun ~/.agents/skills/skill-framework/scripts/layer-guard.ts scripts` exits 0.
- `bun ~/.agents/skills/markdown-quality/scripts/review.ts . --mode=ai` exits 0.
- For workflow changes, run the relevant command against an isolated fixture with a temporary `HOME` and confirm previews leave files and Git state untouched. Report commands, results, and unchecked limits.

# Commands

Every `sync` command, grouped by what it changes.

## Contents

- Setup
- Track and untrack
- Retire a skill
- Mirror a restructure with push
- Why a file differs
- Command effects
- Targets and saved plans

## Setup

Run once per machine. `root add` changes shared policy. `root bind` changes only this machine's locations file. Missing or invalid bindings abort transfers before any copy.

```bash
sync init "$REPO"                                          # never overwrites a manifest
sync root add omp --kind path --repo-root .omp
sync root add agents --kind skill --repo-root .agents/skills
sync root bind omp --local-root ~/.omp/agent
sync root bind agents --local-root ~/.agents/skills
```

## Track and untrack

```bash
sync track path extensions --root omp --sync               # last matching rule wins
sync track path extensions/orca-* --root omp --no-sync
sync track skill mentor --root agents --origin authored    # sync defaults true
sync track skill archify --root agents --origin external \
  --from tt-a1i/archify --source-type github --version 2.17.0 \
  --install 'npx -y skills add tt-a1i/archify -g' --no-sync
sync untrack path extensions/orca-* --root omp             # records an exclusion
sync untrack skill mentor --root agents                    # removes policy only; the backup copy becomes unmanaged
sync untrack skill mentor --root agents --prune            # keeps the entry with sync off so prune can remove the copy
```

Path roots are default-deny: only matching `sync: true` rules transfer. Skill roots use exact entries. Re-tracking a skill keeps its recorded `--origin`, `--from`, `--source-type`, `--version`, `--install`, and `--description` unless a flag replaces them. A new skill still needs `--origin`. Disabling sync or removing tracking never deletes files.

## Retire a skill

Delete the skill in the local root, then remove it from the backup and the remote:

```bash
sync retire mentor archify --root agents --git-push       # preview: files, Git export set, blockers
sync retire mentor archify --root agents --apply --git-push -m "retire mentor, archify"
sync retire --target omp:rules/old.md --apply --git-push  # an excluded backup file, with or without skills
```

`--target <root>:<path>` is repeatable and names one exact file, with no globs. The policy must already exclude the file (`sync untrack path <path> --root <id>`), or its removal must already be pending in Git. A file the policy still manages is refused. Without skill names, `--root` is not needed.

`retire` names exact skills that are already in the manifest. List every skill retired in one batch, because each skill's pending deletion counts as unrelated for a single-skill push. It excludes each skill from the policy, prunes its backup copy and the folders that leaves empty, and with `--git-push` commits and pushes only those paths plus `.ai-sync/manifest.json`. The preview shows the manifest diff: entries added, removed, and changed (by kind, root, path) and line counts, from Git HEAD against the manifest the retire will leave; JSON has it as `git.manifestDiff`. Any other pending change blocks the push with `GIT_DIRTY_UNRELATED` before anything changes. Without `--git-push`, it stops after the local prune. A later `retire --apply --git-push` pushes the pending deletions.

The manual path is `sync untrack skill mentor --root agents --prune`, then `sync prune "$REPO" --apply --target agents:mentor`. Plain `untrack` drops the entry, so `prune` and `retire` can no longer see its backup copy.

## Mirror a restructure with push

`push` copies local files into the backup and never removes backup files by itself. After a restructure, add `--remove-stale` so the backup mirrors the selected `--target`:

```bash
sync push "$REPO" --target agents --remove-stale                       # preview: copies plus the stale files to remove
sync push "$REPO" --target agents --remove-stale --apply --git-push    # one commit holds the copies and the removals
```

A backup file is stale when it is inside `--target`, has no local file, and the policy does not exclude it. Excluded copies stay with `prune`. The preview lists each removal beside the copies, and the JSON result marks it `"type": "delete"`. Apply also removes folders the removals leave empty, except the root's own backup folder. Unrelated Git changes still block `--git-push`. A push never exports `.ai-sync/manifest.json`, so a pending manifest edit blocks it as unrelated: the error names the manifest, the preview shows its diff (`git.manifestDiff`), and the recovery is `sync retire ... --git-push` or committing the manifest yourself. A saved plan (`--plan-out`) records the removals, and `apply` rejects it with `PLAN_STALE_SOURCE` when a local file reappears or `PLAN_STALE_TARGET` when the backup file changed. Pull and prune are unchanged, and `pull --remove-stale` is refused.

## Why a file differs

`status` and `inspect` give each drifting file a `cause` (JSON `drift[]` with `id`, `cause.code`, `cause.message`, `policy`), from facts the tool holds: local presence, backup presence, content, and policy. They never say who changed a file or when.

| Cause | Meaning | Next step |
| --- | --- | --- |
| `only_local` | new locally | `push` copies it |
| `differs` | both sides hold different content | `push` overwrites the backup, `pull` the local file |
| `only_backup` | in the backup, absent locally, policy does not exclude it | `pull` restores it; `push --remove-stale` removes it |
| `excluded_backup_copy` | the policy excludes it | `prune` removes the backup copy |

`inspect` adds `policy`: `managed` or `excluded`, and the deciding rule (`kind`, `root`, `pattern`, `sync`). `prune` names the same rule per entry, in the tree and as `excludedBy` on each JSON action, for example `path rule 'config.yml' (sync: false)`.

## Command effects

| Command | Effect |
| --- | --- |
| `status`, `diff`, `inspect` | read only; `status` and `inspect` explain each drifting file |
| `push`, `pull` | preview; `--apply` needs a bounded `--target`; `push --remove-stale` also removes stale backup files |
| `prune` | preview excluded backup copies; `--apply --target` removes only those |
| `apply plan.json` | recheck the saved plan; `--apply` executes it |
| `discover`, `bootstrap` | read only unless `--write` or `--approve-install` |

## Targets and saved plans

```bash
sync push "$REPO" --target omp --plan-out plan.json   # keep the file outside the backup and managed roots
sync apply plan.json                                  # recheck only
sync apply plan.json --apply                          # stale plans are rejected; nothing changes
sync inspect "$REPO" [--target <scope>]               # items: kind, root, path, shared|local-only, version or null, local path; plus drift causes
sync prune "$REPO"                                    # list; local files and unselected backup content stay untouched
sync prune "$REPO" --apply --target omp:old/skill.md  # remove exact backup copies only
```

`--target` is repeatable. It matches exactly or by glob, never by substring. Accepted forms are a root id, skill name, root-relative path, `<root>:<path>`, or glob. `--exclude <pattern>` filters relative paths.

`apply` takes only a plan file. It recomputes scope, policy, bindings, and every source and target fingerprint. Any change rejects the plan. A concurrent change during apply fails that action and marks later actions `not_attempted`. The outcome is `partial`. Pruning removes working-tree copies only. Git history and remote copies keep earlier versions.

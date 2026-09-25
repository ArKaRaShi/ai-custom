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

# Create the shared v2 manifest once
sync init "$REPO"
sync root add omp --kind path --repo-root .omp
sync root add agents --kind skill --repo-root .agents/skills

# Bind each root to this machine's local directory
sync root bind omp --local-root ~/.omp/agent
sync root bind agents --local-root ~/.agents/skills
```

`root add` changes shared repository policy. `root bind` changes only this machine's locations file. Other machines clone the repository, then bind the same root IDs to their own local directories. Missing or invalid bindings abort transfers before any copy.

## Track and sync

```bash
# Include OMP extensions, then exclude one path (last matching rule wins)
sync track path extensions --root omp --sync
sync track path extensions/orca-* --root omp --no-sync

# Track authored skills (sync defaults true)
sync track skill mentor --root agents --origin authored

# Record an external installer without copying its source to the backup
sync track skill archify --root agents --origin external \
  --from tt-a1i/archify --source-type github --version 2.17.0 \
  --install 'npx -y skills add tt-a1i/archify -g' --no-sync

sync status "$REPO" [--format=json]
sync diff "$REPO"
sync push "$REPO"          # preview by default
sync push "$REPO" --apply  # commit backup export
sync pull "$REPO"          # preview by default
sync pull "$REPO" --apply  # commit restore import
sync resolve "$REPO"
sync merge "$REPO"
```

Path roots are default-deny: only matching `sync: true` rules transfer. Later matching rules override earlier ones. Skill roots use exact entries. `--include-local` cannot override stored `sync: false`. Disabling sync or removing tracking never deletes files. Disabling a synced skill reports its existing backup path for review.

```bash
sync untrack path extensions/orca-* --root omp  # records an exclusion
sync untrack skill mentor --root agents         # removes policy only
```

## Safe Mutation Contract

File mutations are safe by default. Both `push` and `pull` preview file lists without copying bytes. Pass `--apply` to commit transfers to disk or repository.
## Discovery and bootstrap

```bash
sync discover "$REPO"        # report candidates only
sync discover "$REPO" --write # record candidates as sync: false
sync bootstrap "$REPO"
```

Discovery reads only unless you pass `--write`. Bootstrap pulls synced entries and installs absent external skills marked `sync: false` with their stored installer metadata. Review installer commands first. Bootstrap runs them on this machine.

## Migration and compatibility

Installations with v1 path or skill manifests require one `migrate-v2` run from the ai-sync checkout. The command validates and converts the old path policy and local/shared skill records into `.ai-sync/manifest.json`. It then removes old skill-manifest files. A validation failure leaves the source files unchanged. Select the intended repository before migration. Test with an isolated `HOME`.

Runtime commands accept only the unified v2 manifest. This change removes the old positional `track <skill> <origin>` and `untrack <skill>` syntax, plus `prune-manifest` and `migrate-manifest`. Use the root-scoped v2 commands above. `init` does not overwrite an existing manifest.

## Conflict resolution

`ours` means the local file. `theirs` means the repository file. `merge` uses a plain three-way text merge. When resolving conflict markers, preserve non-conflicting changes and get user approval before replacing a conflicted result with a synthesized version.

## Scope options

```bash
sync status "$REPO" --target skills
sync push "$REPO" --target omp --exclude '*.log'
```

`--target` narrows operations by root or category. `--exclude` filters matching relative paths from that operation.

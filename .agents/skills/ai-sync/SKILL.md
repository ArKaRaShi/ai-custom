---
name: ai-sync
description: Use when synchronizing, auditing, resolving conflicts, or deploying custom OMP extensions, task agents, rules, hooks, configs, and agent skills between your local environment and git backup.
---

# `ai-sync`

Synchronize your custom Oh My Pi (OMP) task agents, extensions, TTSR rules, hooks, configs, and user-level skills between your local environment (`~/.omp/agent/` and `~/.agents/skills/`) and your git-tracked repository (`~/Disk/ai-custom/`).

## When to Use

- Check if your local machine is out of sync with your backup repo (`status` / `scan`).
- Check if your remote GitHub repo has new commits from other machines (`status`).
- Inspect line-by-line file differences before syncing (`diff`).
- Resolve divergent files across machines (`resolve` / `merge`).
- Pull down everything or specific categories from `~/Disk/ai-custom` to local machine (`pull`).
- Back up newly authored extensions, rules, or skills into git, with exclusions (`push`).
- Audit configuration and skill drift across machines.

## How to Run

Declare the portable skill path (mirrors `db-sandbox` standard):

```bash
SKILL_DIR="${SKILL_DIR:-$HOME/.agents/skills/ai-sync}"

# 1. Inspect installed skills and provenance; this does not write a manifest
bun "$SKILL_DIR/scripts/sync.ts" discover

# Record newly detected local skills only after review
bun "$SKILL_DIR/scripts/sync.ts" discover --write

# 2. Scan and detect drift, missing files, and remote git status
bun "$SKILL_DIR/scripts/sync.ts" status

# 3. Inspect exact line-by-line differences before taking action
bun "$SKILL_DIR/scripts/sync.ts" diff

# 4. Resolve conflicts interactively (choose ours, theirs, or combine)
bun "$SKILL_DIR/scripts/sync.ts" resolve

# 5. Automatically combine divergent files via plain 3-way merge
bun "$SKILL_DIR/scripts/sync.ts" merge

# 6. Pull down everything from ~/Disk/ai-custom to local machine
bun "$SKILL_DIR/scripts/sync.ts" pull

# 7. Back up local changes to ~/Disk/ai-custom (automatically excludes skills where sync: false)
bun "$SKILL_DIR/scripts/sync.ts" push

# 8. Track a skill in the manifest (origin defaults sync: authored->true, external->false)
bun "$SKILL_DIR/scripts/sync.ts" track mentor authored
bun "$SKILL_DIR/scripts/sync.ts" track archify external --from tt-a1i/archify --version 2.17.0

# Explicitly override sync behavior:
bun "$SKILL_DIR/scripts/sync.ts" track prototype authored --no-sync
bun "$SKILL_DIR/scripts/sync.ts" track my-forked-tool external --sync

# Remove a retired skill from both manifests; preserves its local files
bun "$SKILL_DIR/scripts/sync.ts" untrack writing-agents

# Inspect orphaned local entries, then explicitly remove them locally
bun "$SKILL_DIR/scripts/sync.ts" prune-manifest
bun "$SKILL_DIR/scripts/sync.ts" prune-manifest --apply

# Move a legacy root-level backup manifest once, without overwriting a canonical one
bun "$SKILL_DIR/scripts/sync.ts" migrate-manifest
bun "$SKILL_DIR/scripts/sync.ts" migrate-manifest --apply

# 9. Bootstrap / restore on a fresh machine (pulls sync: true skills, reinstalls externals)
bun "$SKILL_DIR/scripts/sync.ts" bootstrap
```

## Conflict Resolution & Merge Protocol

When local and repository files differ, `ours` means the local copy and `theirs` means the repository copy:

### 1. Plain Merge

`bun sync.ts merge` executes a 3-way text merge (`git merge-file`).

- **Clean Merge:** the tool preserves non-overlapping improvements from both sides.
- **Colliding Merge:** the tool inserts standard conflict markers:

  ```text
  <<<<<<< local (ours)
  Feature A implementation
  =======
  Feature B implementation
  >>>>>>> repo (theirs)
  ```

### 2. AI Agent Rephrase Protocol (CRITICAL)

When an AI agent runs `merge` or resolves conflicts:

1. **Never leave raw conflict markers in the file.**
2. **Rephrase and synthesize:** inspect the conflict block, then combine both improvements into one cohesive document so neither machine's intent disappears.
3. **Present the synthesis to the user:** ask the user to approve the rephrased output.

## Skill Provenance & Manifest (`skills-manifest.json`)

To prevent git repo pollution from massive third-party installations (like `archify` with 400+ files) or experimental prototypes, `ai-sync` separates **provenance** (`origin`) from **sync behavior** (`sync` flag):

| Origin | Sync Flag | Meaning | In Git Repo? | Sync Behavior |
| --- | --- | --- | --- | --- |
| **`authored`** | `sync: true` (default) | Custom skills authored by you | ✅ Full source code | Backed up & pulled across all machines |
| **`authored`** | `sync: false` (`--no-sync`) | Scratchpad, machine-specific test | ❌ Excluded | Never touches shared backup |
| **`external`** | `sync: false` (default) | Upstream tools (Archify, Caveman, Graphify) | ❌ Only metadata pointer in manifest | Source excluded from git; restored via upstream install |
| **`external`** | `sync: true` (`--sync`) | Third-party skill you heavily customized | ✅ Full source code | Vendored into your git repo |

### Manifest File Locations

The only manifests are:

- **Machine local:** `~/.agents/skills/skills-manifest.json`
- **Git backup:** `~/Disk/ai-custom/.agents/skills/skills-manifest.json`

The backup manifest moves through the normal `skills` sync target. Do not create or edit a root-level `skills-manifest.json` in the backup repository.

### CLI Track Options

```bash
# Track authored skill (sync defaults to true)
bun ~/.agents/skills/ai-sync/scripts/sync.ts track mentor authored

# Track external skill with upstream source (sync defaults to false)
bun ~/.agents/skills/ai-sync/scripts/sync.ts track archify external --from tt-a1i/archify --version 2.17.0

# Toggle sync flag explicitly
bun ~/.agents/skills/ai-sync/scripts/sync.ts track prototype authored --no-sync
bun ~/.agents/skills/ai-sync/scripts/sync.ts track my-fork external --sync
```

### Manifest Lifecycle

| Situation | Command | Effect |
| --- | --- | --- |
| Inspect provenance | `discover` | Read-only report. |
| Record detected local skills | `discover --write` | Adds detected entries locally. Preserves existing entries. |
| Add or change a tracked skill | `track <skill> <origin> [--sync\|--no-sync]` | Writes local and shared manifests. |
| Retire a shared skill | `untrack <skill>` | Removes the entry from both manifests. Never deletes skill files. |
| Remove local metadata for missing files | `prune-manifest --apply` | Removes only orphaned local entries. Leaves the shared manifest unchanged. |
| Migrate a legacy root manifest | `migrate-manifest --apply` | Moves the manifest to the canonical skills target when no canonical manifest exists. |

For a rename, run `track` for the new name, `untrack` the old name, then `push skills`. Other machines must run `pull` before their next `push`. Otherwise, they can restore the retired directory.

### Manifest Repair Guide

| Symptom | Required action |
| --- | --- |
| `discover` reports a directory without `SKILL.md` | Remove or repair that directory. Do not track it. |
| `discover` reports an orphaned local entry | Review it, then run `prune-manifest --apply` only when the local record is obsolete. |
| Retired skill | Run `untrack <skill>`. Do not hand-edit either manifest or force-copy manifests. |
| A skill should remain private | Use `track <skill> authored --no-sync`. Do not use `push --include-local`. |
| A root-level backup manifest exists | Review it, then run `migrate-manifest --apply`. Resolve manually if a canonical manifest also exists. |

### Manifest Red Flags

| Shortcut | Correct path |
| --- | --- |
| “`push` will remove the old skill.” | `push` copies local changes. Run `untrack <skill>` first. |
| “I can edit one manifest.” | `untrack` changes both manifests atomically. |
| “Missing locally means delete shared metadata.” | Use `prune-manifest --apply` only for local metadata. Use `untrack` for global retirement. |
| “`discover` is harmless.” | It only reads unless you pass `--write`. |

## Final Report (Required)

`status`, `push`, and `pull` end with a native `⚠️ Needs your decision` table. Always relay it verbatim, then state what happened, such as the pushed or pulled file count or `100% in sync`.

Each row gives the user one decision:

| Row | Meaning | User's options |
| --- | --- | --- |
| `skills/<name>/` (local only, not in manifest) | Untracked local skill; it may be stale or intentional | Remove the directory, or `track` it |
| `manifest: <name>` (manifest only) | Manifest entry with no local files; this machine may be stale | `pull` to restore, or `prune-manifest --apply` after review |
| `skills/<name> (sync: false)` | Intentionally local-only | Nothing; informational |

Report only. Never delete a skill directory or manifest entry without explicit user approval. A missing entry may need removal, or this machine may need an update. The user decides.

## Advanced Options

Execute these targeted commands when needed:

### 1. Scoped Category or Target Sync

You can scope operations to one category (`skills`, `instructions`, `agents`, `rules`, `extensions`, `hooks`, `config`, `tests`) or a specific keyword:

```bash
# Only status or sync user skills
bun ~/.agents/skills/ai-sync/scripts/sync.ts status skills
bun ~/.agents/skills/ai-sync/scripts/sync.ts push skills

# Force inclusion of external/ignored skills in backup (rare)
bun ~/.agents/skills/ai-sync/scripts/sync.ts push --include-local
```

| Command | Action | Key Options |
| --- | --- | --- |
| `sync.ts status` | Scans differences between the machine and repository, plus remote git status | `--target <cat>`, `--exclude <name>` |
| `sync.ts diff` | Shows line-by-line unified diffs for modified files | `--target <cat>` |
| `sync.ts resolve` | Interactive resolution: [1] ours, [2] theirs, [3] combine | `--target <cat>` |
| `sync.ts merge` | Plain 3-way merge to combine changes into both sides | `--target <cat>` |
| `sync.ts pull` | Imports files from repo to local machine (`~`) | `--target <cat>`, `--exclude <name>` |
| `sync.ts push` | Exports files from local machine to repo | `--target <cat>`, `--exclude <name>` |

## What Gets Synced

| Category | Local Path (`~`) | Repo Path (`~/Disk/ai-custom`) |
| --- | --- | --- |
| **OMP Instructions** | `~/.omp/agent/AGENTS.md` | `.omp/AGENTS.md` |
| **OMP MCP** | `~/.omp/agent/mcp.json` | `.omp/mcp.json` |
| **OMP Config** | `~/.omp/agent/config.yml` | `.omp/config.yml` |
| **OMP Agents** | `~/.omp/agent/agents/` | `.omp/agents/` |
| **Extensions** | `~/.omp/agent/extensions/` | `.omp/extensions/` |
| **TTSR Rules** | `~/.omp/agent/rules/` | `.omp/rules/` |
| **Hooks** | `~/.omp/agent/hooks/` | `.omp/hooks/` |
| **Tests** | `~/.omp/agent/tests/` | `.omp/tests/` |
| **User Skills** | `~/.agents/skills/` | `.agents/skills/` |

---
name: ai-sync
description: Use when synchronizing, auditing, resolving conflicts, or deploying custom OMP extensions, rules, hooks, configs, and agent skills between your local environment and git backup.
---

# `ai-sync`

Synchronize your custom Oh My Pi (OMP) extensions, TTSR rules, hooks, configs, and user-level skills between your local environment (`~/.omp/agent/` and `~/.agents/skills/`) and your git-tracked repository (`~/Disk/ai-custom/`).

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

# 1. Auto-discover all installed skills, categorize provenance, and generate report
bun "$SKILL_DIR/scripts/sync.ts" discover

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

# 9. Bootstrap / restore on a fresh machine (pulls sync: true skills, reinstalls externals)
bun "$SKILL_DIR/scripts/sync.ts" bootstrap
```
## Conflict Resolution & Merge Protocol

When a skill or file has been modified differently on this local machine (`ours`) versus the repo (`theirs`):

### 1. Plain Merge
`bun sync.ts merge` executes a 3-way text merge (`git merge-file`).
- **Clean Merge:** Non-overlapping improvements from both sides are preserved automatically.
- **Colliding Merge:** Standard conflict markers are inserted:
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
2. **Rephrase & Synthesize:** The agent MUST inspect the conflict block and synthesize/rephrase both improvements into a single cohesive, unified document so neither machine's intent is lost.
3. **Present Synthesis to User:** Provide the rephrased output to the user for approval.
## Skill Provenance & Manifest (`skills-manifest.json`)

To prevent git repo pollution from massive third-party installations (like `archify` with 400+ files) or experimental prototypes, `ai-sync` separates **provenance** (`origin`) from **sync behavior** (`sync` flag):

| Origin | Sync Flag | Meaning | In Git Repo? | Sync Behavior |
|---|---|---|---|---|
| **`authored`** | `sync: true` (default) | Custom skills authored by you | ✅ Full source code | Backed up & pulled across all machines |
| **`authored`** | `sync: false` (`--no-sync`) | Scratchpad, machine-specific test | ❌ Excluded | Never touches shared backup |
| **`external`** | `sync: false` (default) | Upstream tools (Archify, Caveman, Graphify) | ❌ Only metadata pointer in manifest | Source excluded from git; restored via upstream install |
| **`external`** | `sync: true` (`--sync`) | Third-party skill you heavily customized | ✅ Full source code | Vendored into your git repo |

### Manifest File Locations:
- **Machine Local:** `~/.agents/skills/skills-manifest.json`
- **Git Repo:** `~/Disk/ai-custom/.agents/skills/skills-manifest.json`

### CLI Track Options:
```bash
# Track authored skill (sync defaults to true)
bun ~/.agents/skills/ai-sync/scripts/sync.ts track mentor authored

# Track external skill with upstream source (sync defaults to false)
bun ~/.agents/skills/ai-sync/scripts/sync.ts track archify external --from tt-a1i/archify --version 2.17.0

# Toggle sync flag explicitly
bun ~/.agents/skills/ai-sync/scripts/sync.ts track prototype authored --no-sync
bun ~/.agents/skills/ai-sync/scripts/sync.ts track my-fork external --sync
```
## Advanced Options

### 1. Scoped Category or Target Sync
You can scope operations to a single category (`skills`, `rules`, `extensions`, `hooks`, `config`, `tests`) or a specific keyword:

```bash
# Only status or sync user skills
bun ~/.agents/skills/ai-sync/scripts/sync.ts status skills
bun ~/.agents/skills/ai-sync/scripts/sync.ts push skills

# Force inclusion of external/ignored skills in backup (rare)
bun ~/.agents/skills/ai-sync/scripts/sync.ts push --include-local
```
| Command | Action | Key Options |
|---|---|---|
| `sync.ts status` | Scans machine vs repo + remote git status | `--target <cat>`, `--exclude <name>` |
| `sync.ts diff` | Shows line-by-line unified diffs for modified files | `--target <cat>` |
| `sync.ts resolve` | Interactive resolution: [1] ours, [2] theirs, [3] combine | `--target <cat>` |
| `sync.ts merge` | Plain 3-way merge to combine changes into both sides | `--target <cat>` |
| `sync.ts pull` | Imports files from repo to local machine (`~`) | `--target <cat>`, `--exclude <name>` |
| `sync.ts push` | Exports files from local machine to repo | `--target <cat>`, `--exclude <name>` |

## What Gets Synced

| Category | Local Path (`~`) | Repo Path (`~/Disk/ai-custom`) |
|---|---|---|
| **OMP Config** | `~/.omp/agent/config.yml` | `.omp/config.yml` |
| **Extensions** | `~/.omp/agent/extensions/` | `.omp/extensions/` |
| **TTSR Rules** | `~/.omp/agent/rules/` | `.omp/rules/` |
| **Hooks** | `~/.omp/agent/hooks/` | `.omp/hooks/` |
| **Tests** | `~/.omp/agent/tests/` | `.omp/tests/` |
| **User Skills** | `~/.agents/skills/` | `.agents/skills/` |

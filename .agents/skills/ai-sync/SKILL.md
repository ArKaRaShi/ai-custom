---
name: ai-sync
description: Use when synchronizing, auditing, or deploying custom OMP extensions, rules, hooks, configs, and agent skills between your local environment and git backup.
---

# `ai-sync`

Synchronize your custom Oh My Pi (OMP) extensions, TTSR rules, hooks, configs, and user-level skills between your local environment (`~/.omp/agent/` and `~/.agents/skills/`) and your git-tracked repository (`~/Disk/ai-custom/`).

## When to Use

- Check if your local machine is out of sync with your backup repo (`status` / `scan`).
- Check if your remote GitHub repo has new commits from other machines (`status`).
- Inspect line-by-line file differences before syncing (`diff`).
- Pull down everything or specific categories from `~/Disk/ai-custom` to local machine (`pull`).
- Back up newly authored extensions, rules, or skills into git, with exclusions (`push`).
- Audit configuration and skill drift across machines.

## How to Run

Run via **Bun** (no installation required):

```bash
# 1. Scan and detect drift, missing files, and remote git status
bun ~/.agents/skills/ai-sync/scripts/sync.ts status

# 2. Inspect exact line-by-line differences before taking action
bun ~/.agents/skills/ai-sync/scripts/sync.ts diff

# 3. Pull down everything from ~/Disk/ai-custom to local machine
bun ~/.agents/skills/ai-sync/scripts/sync.ts pull

# 4. Back up local changes to ~/Disk/ai-custom
bun ~/.agents/skills/ai-sync/scripts/sync.ts push
```

## Advanced Options

### 1. Scoped Category or Target Sync
You can scope operations to a single category (`skills`, `rules`, `extensions`, `hooks`, `config`, `tests`) or a specific keyword:

```bash
# Only status or sync user skills
bun ~/.agents/skills/ai-sync/scripts/sync.ts status skills
bun ~/.agents/skills/ai-sync/scripts/sync.ts push skills

# Only diff or pull extensions
bun ~/.agents/skills/ai-sync/scripts/sync.ts diff extensions
bun ~/.agents/skills/ai-sync/scripts/sync.ts pull extensions
```

### 2. Excluding Files or Directories
Use `--exclude` (or `-x`) to skip experimental or unfinished skills and temp files:

```bash
# Back up everything except the experimental prototype skill
bun ~/.agents/skills/ai-sync/scripts/sync.ts push --exclude prototype

# Multiple exclusions or wildcard patterns
bun ~/.agents/skills/ai-sync/scripts/sync.ts push -x prototype -x "*.log"
```

### 3. Custom Repo Path
You can optionally pass an alternate git repository path:

```bash
bun ~/.agents/skills/ai-sync/scripts/sync.ts status /path/to/custom-repo
bun ~/.agents/skills/ai-sync/scripts/sync.ts pull /path/to/custom-repo
```

## Quick Reference Table

| Command | Action | Key Options |
|---|---|---|
| `sync.ts status` | Scans machine vs repo + remote git status | `--target <cat>`, `--exclude <name>` |
| `sync.ts diff` | Shows line-by-line unified diffs for modified files | `--target <cat>` |
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

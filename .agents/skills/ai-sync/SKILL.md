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

Run via **Bun** (no installation required):

```bash
# 1. Scan and detect drift, missing files, and remote git status
bun ~/.agents/skills/ai-sync/scripts/sync.ts status

# 2. Inspect exact line-by-line differences before taking action
bun ~/.agents/skills/ai-sync/scripts/sync.ts diff

# 3. Resolve conflicts interactively (choose ours, theirs, or combine)
bun ~/.agents/skills/ai-sync/scripts/sync.ts resolve

# 4. Automatically combine divergent files via plain 3-way merge
bun ~/.agents/skills/ai-sync/scripts/sync.ts merge

# 5. Pull down everything from ~/Disk/ai-custom to local machine
bun ~/.agents/skills/ai-sync/scripts/sync.ts pull

# 6. Back up local changes to ~/Disk/ai-custom
bun ~/.agents/skills/ai-sync/scripts/sync.ts push
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

## Advanced Options

### 1. Scoped Category or Target Sync
You can scope operations to a single category (`skills`, `rules`, `extensions`, `hooks`, `config`, `tests`) or a specific keyword:

```bash
# Only status or sync user skills
bun ~/.agents/skills/ai-sync/scripts/sync.ts status skills
bun ~/.agents/skills/ai-sync/scripts/sync.ts push skills

# Only diff or merge extensions
bun ~/.agents/skills/ai-sync/scripts/sync.ts diff extensions
bun ~/.agents/skills/ai-sync/scripts/sync.ts merge extensions
```

### 2. Excluding Files or Directories
Use `--exclude` (or `-x`) to skip experimental skills and temp files:

```bash
# Back up everything except the experimental prototype skill
bun ~/.agents/skills/ai-sync/scripts/sync.ts push --exclude prototype

# Multiple exclusions or wildcard patterns
bun ~/.agents/skills/ai-sync/scripts/sync.ts push -x prototype -x "*.log"
```

## Quick Reference Table

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

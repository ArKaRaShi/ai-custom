---
name: ai-sync
description: Sync, scan, and fill gaps between your local AI setup (~/.omp and ~/.agents/skills) and your git-backed ~/Disk/ai-custom repository across machines.
---

# `ai-sync`

Synchronize your custom Oh My Pi (OMP) extensions, TTSR rules, hooks, configs, and user-level skills between your local environment (`~/.omp/agent/` and `~/.agents/skills/`) and your git-tracked repository (`~/Disk/ai-custom/`).

## When to Use

- Check if your local machine is out of sync with your backup repo (`status` / `scan`).
- Bootstrap a fresh machine by pulling down all extensions, rules, and skills (`pull`).
- Back up newly authored extensions, rules, or skills into git (`push`).
- Audit file diffs and drift across machines.

## How to Run

Run via **Bun** (no installation required):

```bash
# 1. Scan and detect drift / missing files
bun ~/.agents/skills/ai-sync/scripts/sync.ts status

# 2. Pull down everything from ~/Disk/ai-custom to local machine (fill gaps)
bun ~/.agents/skills/ai-sync/scripts/sync.ts pull

# 3. Back up local changes to ~/Disk/ai-custom
bun ~/.agents/skills/ai-sync/scripts/sync.ts push
```

## Custom Repo Path

You can optionally pass a custom repository path as the second argument:

```bash
bun ~/.agents/skills/ai-sync/scripts/sync.ts status /path/to/custom-repo
bun ~/.agents/skills/ai-sync/scripts/sync.ts pull /path/to/custom-repo
```

## What Gets Synced

| Category | Local Path (`~`) | Repo Path (`~/Disk/ai-custom`) |
|---|---|---|
| **OMP Config** | `~/.omp/agent/config.yml` | `.omp/config.yml` |
| **Extensions** | `~/.omp/agent/extensions/` | `.omp/extensions/` |
| **TTSR Rules** | `~/.omp/agent/rules/` | `.omp/rules/` |
| **Hooks** | `~/.omp/agent/hooks/` | `.omp/hooks/` |
| **Tests** | `~/.omp/agent/tests/` | `.omp/tests/` |
| **User Skills** | `~/.agents/skills/` | `.agents/skills/` |

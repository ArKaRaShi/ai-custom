# ai-custom

Cross-machine AI coding harness configuration, OMP extensions, TTSR rules, lifecycle hooks, and agent skills.

## Architecture & Layout

```text
~/Disk/ai-custom/
├── .omp/                       # Oh My Pi runtime configuration (~/.omp/agent/)
│   ├── config.yml              # Model routing, themes, statusline
│   ├── extensions/             # Extensions (caveman-stats, quota-status, turn-metrics)
│   ├── hooks/                  # Lifecycle hooks
│   │   ├── pre/                # Safety guards (guard-destructive)
│   │   └── post/               # Output filters & alerts (redact, smart-terminal-notifier)
│   ├── rules/                  # 16 TTSR Python & TypeScript code quality rules
│   └── tests/                  # 120 automated test assertions across 13 suites
└── .agents/skills/             # Authored agent skills & dependency manifest
    ├── skills-manifest.json    # Provenance manifest (authored vs external pointers)
    ├── ai-sync/                # Bidirectional sync engine + auto-discovery tracker
    ├── db-sandbox/             # Disposable database sandboxing (MySQL & PostgreSQL)
    ├── git-emoji-commit/       # Semantic emoji conventional commit messages
    ├── git-pr/                 # Proportional PR title and body generator
    ├── isolated-worktree/      # Isolated Git worktree development
    ├── markdown-quality/       # 2-phase Markdown QA (markdownlint-cli2 + Vale)
    └── mentor/                 # Senior engineer interactive teaching harness

## Toolchain & Prerequisites

Core external CLI tools managed via Homebrew:

```bash
# Markdown quality toolchain
brew install markdownlint-cli2 vale

# Sync Vale style rules (ai-tells, write-good, proselint)
vale sync
```

## Quick Setup on a Fresh Machine

```bash
# 1. Clone your backup repository
git clone https://github.com/ArKaRaShi/ai-custom.git ~/Disk/ai-custom

# 2. Bootstrap: syncs authored skills & installs external dependencies
REPO_DIR="${AI_CUSTOM_REPO:-$HOME/Disk/ai-custom}"
bun "$REPO_DIR/.agents/skills/ai-sync/scripts/sync.ts" bootstrap

# 3. Run automated validation suite
bun test "$REPO_DIR/.omp/tests"
```

## Workflow Commands

```bash
SKILL_DIR="${SKILL_DIR:-$HOME/.agents/skills/ai-sync}"

# 1. Auto-discover installed skills & generate provenance report
bun "$SKILL_DIR/scripts/sync.ts" discover

# 2. Check drift between local machine and git backup
bun "$SKILL_DIR/scripts/sync.ts" status

# 3. Pull repository updates to local machine
bun "$SKILL_DIR/scripts/sync.ts" pull

# 4. Export local modifications back into repo (excludes sync: false)
bun "$SKILL_DIR/scripts/sync.ts" push

# 5. Track a skill explicitly in the manifest
bun "$SKILL_DIR/scripts/sync.ts" track mentor authored
bun "$SKILL_DIR/scripts/sync.ts" track archify external --from tt-a1i/archify
bun "$SKILL_DIR/scripts/sync.ts" track prototype authored --no-sync
```
Test suite verifies rule syntax, regex correctness, and sync mappings:

```bash
bun test .omp/tests
```

# ai-custom

Cross-machine AI coding harness configuration, OMP extensions, TTSR rules, lifecycle hooks, and agent skills.

## Architecture & Layout

```text
~/Disk/ai-custom/
├── .omp/                       # Oh My Pi runtime configuration (~/.omp/agent/)
│   ├── config.yml              # Model routing, themes, statusline
│   ├── extensions/             # Extensions (caveman-stats, quota-status, turn-metrics)
│   ├── hooks/                  # Lifecycle hooks
│   │   ├── pre/                # Safety guards (guard-destructive, protect-branch)
│   │   └── post/               # Output filters & alerts (redact, smart-terminal-notifier)
│   ├── rules/                  # 16 TTSR Python & TypeScript code quality rules
│   └── tests/                  # 126 automated test assertions across 14 suites
└── .agents/skills/             # User-level agent skills (~/.agents/skills/)
    ├── ai-sync/                # Bidirectional sync engine between machine and repository
    ├── markdown-quality/       # 2-phase Markdown QA (markdownlint-cli2 + Vale with ai-tells)
    ├── db-sandbox/             # Disposable database sandboxing (MySQL & PostgreSQL)
    ├── isolated-worktree/      # Isolated Git worktree development (renamed from parallel-worktrees)
    ├── git-pr/                 # Proportional PR title and body generator (renamed from git-pr-convention)
    ├── git-emoji-commit/       # Semantic emoji conventional commit messages (renamed from emoji-commit)
    ├── domain-modeling/        # Ubiquitous language, CONTEXT.md, and ADRs
    ├── mentor/                 # Read-only architectural teaching and system tracing
    ├── caveman/                # Token-compressed communication and review subagents
    └── ...                     # Additional productivity skills (graphify, prototype, grilling)
```

## Toolchain & Prerequisites

Core external CLI tools managed via Homebrew:

```bash
# Markdown quality toolchain
brew install markdownlint-cli2 vale

# Sync Vale style rules (ai-tells, write-good, proselint)
vale sync
```

## Quick Sync on Any Machine

```bash
# 1. Clone your backup repository
git clone https://github.com/ArKaRaShi/ai-custom.git ~/Disk/ai-custom

# 2. Pull and apply configuration to this machine
bun ~/Disk/ai-custom/.agents/skills/ai-sync/scripts/sync.ts pull

# 3. Run automated validation suite
bun test ~/Disk/ai-custom/.omp/tests
```

## Workflow Commands

```bash
# Check drift between local machine and git backup
bun ~/.agents/skills/ai-sync/scripts/sync.ts status

# Apply repo updates to local machine
bun ~/.agents/skills/ai-sync/scripts/sync.ts pull

# Export local machine modifications back into repo
bun ~/.agents/skills/ai-sync/scripts/sync.ts push
```

## Automated Test Suite

Test suite verifies rule syntax, regex correctness, and sync mappings:

```bash
bun test .omp/tests
```

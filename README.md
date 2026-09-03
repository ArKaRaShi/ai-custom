# ai-custom

Cross-machine AI coding harness configuration, OMP extensions, TTSR rules, lifecycle hooks, and agent skills.

## Architecture & Layout

```text
~/Disk/ai-custom/
├── .omp/                       # Oh My Pi runtime configuration (~/.omp/agent/)
│   ├── config.yml              # Model routing, themes, statusline
│   ├── extensions/             # Extensions (quota-status, turn-metrics, caveman-stats)
│   ├── hooks/post/             # Lifecycle hooks (redact)
│   ├── rules/                  # 10 TTSR Python & TypeScript code quality rules
│   └── tests/                  # 92 automated test assertions across 12 suites
│
└── .agents/skills/             # User-level agent skills (~/.agents/skills/)
    ├── ai-sync/                # Bidirectional sync engine between machine and repository
    ├── markdown-quality/       # 2-phase Markdown QA (markdownlint-cli2 + Vale with ai-tells)
    ├── db-sandbox/             # Disposable database sandboxing (MySQL & PostgreSQL)
    ├── parallel-worktrees/     # Concurrent isolated Git worktrees
    ├── git-pr-convention/      # Conventional PR generator
    ├── domain-modeling/        # Ubiquitous language, CONTEXT.md, and ADRs
    ├── mentor/                 # Read-only architectural teaching and system tracing
    ├── cavecrew/               # Subagent delegation with compressed context
    └── ...                     # Additional productivity skills
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

# ai-custom

Custom cross-machine AI developer configuration, OMP extensions, TTSR rules, lifecycle hooks, and user skills.

## Structure

```
~/Disk/ai-custom/
├── .omp/                       # Oh My Pi runtime configuration
│   ├── config.yml              # Model routing, theme, statusline
│   ├── extensions/             # quota-status, turn-metrics, caveman-stats
│   ├── hooks/post/             # redact hook
│   ├── rules/                  # 9 TTSR Python & TypeScript rules
│   └── tests/                  # 85 automated Bun tests
│
└── .agents/skills/             # User-level agent skills
    ├── ai-sync/                # Bidirectional sync engine (this skill)
    ├── db-sandbox/             # Database sandboxing
    ├── parallel-worktrees/     # Isolated Git worktrees
    ├── git-pr-convention/      # PR convention generator
    └── ...                     # All other personal skills
```

## Quick Sync on Any Machine

```bash
# 1. Clone your repo
git clone <your-git-url> ~/Disk/ai-custom

# 2. Pull / Apply to this machine
bun ~/Disk/ai-custom/.agents/skills/ai-sync/scripts/sync.ts pull

# 3. Verify tests
bun test ~/Disk/ai-custom/.omp/tests
```

## Commands

```bash
# Status scan / drift detection
bun ~/.agents/skills/ai-sync/scripts/sync.ts status

# Pull / fill gaps on local machine
bun ~/.agents/skills/ai-sync/scripts/sync.ts pull

# Backup local machine into this repo
bun ~/.agents/skills/ai-sync/scripts/sync.ts push
```

# ai-custom

Cross-machine AI coding harness configuration, OMP extensions, TTSR rules, lifecycle hooks, and agent skills.

## Layout

```text
~/Disk/ai-custom/
├── .omp/                  # OMP config, linked file by file into ~/.omp/agent
│   ├── extensions/        # Extensions (quota-status, ...)
│   ├── hooks/             # Lifecycle hooks (pre: safety guards, post: redaction and alerts)
│   ├── rules/             # TTSR Python and TypeScript code-quality rules
│   └── tests/             # Tests for the rules and hooks
├── .agents/skills/        # Authored skills, each folder linked into ~/.agents/skills
├── install.sh             # Links the repo into this Mac (preview by default)
├── promote.sh, demote.sh  # Make a local item shared, or stop sharing it
├── externals.txt          # Install commands for external skills, kept per Mac
├── lib.sh                 # Shared setup for the scripts above
├── tests/smoke.sh         # Smoke tests for the scripts above
├── docs/                  # ADRs and agent docs
├── archive/               # Retired files kept for reference; never linked
└── GLOSSARY.md            # Terms used in this repo
```

## toolchain & prerequisites

Core external CLI tools managed via Homebrew:

```bash
# Markdown quality toolchain
brew install markdownlint-cli2 vale

# Sync Vale style rules (ai-tells, write-good, proselint)
vale sync
```

## How sharing works

This repo is the only copy of your authored skills and OMP config. Each Mac has one clone, and `install.sh` makes the Mac's folders symlinks into it.

- **Authored** items live in this repo. `~/.agents/skills/<skill>` and each file under `~/.omp/agent` link into it, so an edit changes the repo files directly.
- **External** skills (installed by `npx skills add` or similar) stay as real folders on each Mac. `externals.txt` lists their install commands.
- **Local-only** files (`orca-*` extensions, databases, sessions) are never in the repo and never touched. The shared `.omp/config.yml` is linked into `~/.omp/agent/config.yml`.

## Set up a Mac

```bash
# 1. Clone
git clone https://github.com/ArKaRaShi/ai-custom.git ~/Disk/ai-custom
cd ~/Disk/ai-custom

# 2. Preview. Changes nothing and lists every action.
./install.sh

# 3. Apply. Asks before running each externals.txt command.
./install.sh --apply
```

- Preview lists `link`, `relink`, `replace`, `remove`, `install` and `CONFLICT` actions.
- `--apply` moves a real folder that is identical to the repo copy to `~/.config/ai-custom/backups/<timestamp>/`, then links it.
- A real folder that differs is a **conflict**. `--apply` refuses to start, so nothing is half-done. Move or delete the local copy, or run `./promote.sh` to make it the shared one, then rerun.
- `--apply --yes` skips the install prompts.
- Re-running after `git pull` links new skills and removes links whose target left the repo.
- Run `vale sync` after cloning. Vale downloads its styles on each Mac, and git does not store them.

## Daily use

```bash
git pull && ./install.sh --apply     # pick up changes from another Mac
# edit a skill in place, then:
git add -A && git commit -m "..." && git push
```

Renaming or deleting a skill is a plain `git mv` or `git rm`. Other Macs get the change on `git pull` and `./install.sh --apply`, which removes the dangling link.

## Make something local to one Mac: skip.txt

`./install.sh --apply` creates `~/.config/ai-custom/skip.txt` the first time. It lives outside the repo, so each Mac has its own. One entry per line, `<root>:<path>`, `*` matches any characters, and `#` starts a comment:

```text
# Entries this Mac must not link from ai-custom.
agents:db-sandbox            # a skill folder
agents:principle-*           # every skill starting with principle-
omp:extensions/quota-status.ts
omp:rules/*
```

- `agents:` is a skill name in the skills folder. `omp:` is a path under `~/.omp/agent`.
- A skipped item gets no link, and the next `--apply` removes an existing link for it. The repo copy remains unchanged.
- If an external skill's `agents:` entry is in the skip list, `install.sh` does not install it.
- `./install.sh` warns about entries that match nothing in the repo, which often means a typo.

## Share a new skill, or stop sharing one

```bash
./install.sh --status            # lists real folders in neither the repo nor externals.txt
./promote.sh my-skill            # move it into the repo and leave a link; then commit
./promote.sh omp:rules/new.md    # the same for an omp file
./demote.sh my-skill             # move it back out of the repo as a real folder; then commit
```

Both accept `-n` to show the actions without doing them. After `demote.sh`, other Macs lose the skill on their next `--apply`, because their link dangles.

## External skills: externals.txt

Each line is `<skill name> | <install command> [| note]`. A version pin has to be inside the command, because the note is only displayed. `./install.sh` lists a missing external skill as `install`, and `--apply` asks before running it. A failed install stops the rest.

## Merge conflicts

Each skill has one copy, so a conflict is a normal git conflict from `git pull`. Resolve it in the file, `git add` it and commit. `install.sh` never edits repo content.

## Tests

```bash
sh tests/smoke.sh      # install.sh, promote.sh and demote.sh on throwaway directories
bun test .omp/tests    # omp rule and hook tests
```

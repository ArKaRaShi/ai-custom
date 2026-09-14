---
name: standard-skill-layout
description: >
  Use when creating or renaming a skill and choosing its directory and file
  names, when mirroring the layout of an existing skill, or when auditing a
  skill folder for naming and structure drift. The canonical layout standard
  for authored skills under ~/.agents/skills/.
---

# Standard Skill Layout

Canonical directory and naming standard for authored skills. Apply it without
consulting another skill's files.

**Why:** SKILL.md loads into context on every use; subdirectories load only
when the agent reads a path inside them. Keeping heavy docs and executable code out of
SKILL.md keeps the always-loaded prompt small.

## Tree

```text
~/.agents/skills/
  skills-manifest.json          # only file allowed at this root
  <skill-name>/
    SKILL.md                    # required; the only required file
    scripts/                    # executable tools the agent runs
    references/                 # long docs the agent reads on demand
    assets/                     # static config/templates scripts consume
    tests/                      # checks for scripts/
    examples/                   # sample inputs/outputs to imitate
    LICENSE                     # license text for vendored content
```

Allowed subdirs are exactly: scripts, references, tests, assets, examples.
A correct minimal skill is SKILL.md alone (flat, and complete).

## Directories

| Dir | What belongs here | Size rule |
| --- | --- | --- |
| `SKILL.md` | overview, when-to-use, rules, pointers to subdirs | ~200-400 words |
| `scripts/` | `*.ts`/`*.py`/`*.sh` the agent runs (`bun`, `python`) | any |
| `references/` | deep docs: API, contracts, formats, quirks | only >~100-line docs |
| `assets/` | config read by scripts (`*.ini`, `*.jsonc`, `*.yml`) | any |
| `tests/` | `*.test.*` covering `scripts/` | any |
| `examples/` | sample input/output showing expected shape | any |

If content fits SKILL.md without pushing past ~400 words, keep it inline.
Create a subdir only when it has real content, never speculatively.

## Naming

- Directory name == frontmatter `name:` == lowercase kebab, `^[a-z0-9-]+$`.
- Prefer plain nouns/verbs that say the job: `finding-bugs`, `syncing-config`.
  No `_`, capitals, or spaces.
- Frontmatter `description:` is the trigger text ("Use when …"); it decides
  loading, so it must name the symptoms, not summarize the steps.
- Never `-last`, `-new`, `-v2`, `-copy`, `-backup` suffixes. A superseded
  skill gets renamed or removed. Suffix piles are drift.

## Placement

Route a new file by kind:

- runnable code -> `scripts/`
- >100-line markdown doc -> `references/`
- config the code reads -> `assets/`
- tests -> `tests/`
- sample data -> `examples/`
- anything else: only `SKILL.md` or `LICENSE` may sit at the skill root

Never: a second `README.md` (SKILL.md is the entry point); `*.test.*` at the
skill root; package manifests or `node_modules` in an authored skill, because
scripts run through `bun`.

## Body shape by type

- **Reference** (this skill): trigger, lookup tables, pointers to subdirs.
- **Technique** (one method): core rule, one before/after example, pitfalls.
- **Workflow** (ordered procedure): numbered steps, gates, verification last.

### Workflow body

```markdown
## Workflow

1. <action> (gate: <condition before advancing>)
2. <action>; if <branch> -> step 5, else step 3
3. <action> (repeat until: <clean condition>)
N. Verify: <specific output proving it worked>
```

- Imperative voice, one action per step. Adding "and then" makes two steps.
- Sub-actions inside a step are bullets, not nested numbers.
- Every risky or irreversible step carries an inline `gate:` (e.g. "ask user
  before commit").
- Write branches as their own clause (`if X -> step 4`). Step bodies hold one action.
- The final step verifies with an observable result, never summarizes.
- More than ~7 steps -> group under `## Phase: <name>` and number per phase.
- Step detail past ~10 lines moves to `references/<step>.md`; the step keeps
  one line plus the pointer.

## Scope

Applies to manifest `origin: authored` skills. Skills marked `external` keep
upstream layout untouched. Reinstalls would revert any restructuring.

## Creating a skill

1. `mkdir ~/.agents/skills/<kebab-name>/`
2. Write `SKILL.md` with `name:` equal to the directory.
3. Add subdirs only when content demands (see Placement).
4. Register as authored and back up to the sync repo.

## Mirror checklist

Auditing or cloning an existing skill:

1. dir == `name:` == kebab, no forbidden suffix
2. exactly one `SKILL.md`, no `README.md`
3. no loose files at skills root or skill root
4. heavy docs in `references/`, code in `scripts/`, tests in `tests/`
5. no package manifest or `node_modules`

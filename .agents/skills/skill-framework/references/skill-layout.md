---
name: skill-layout
description: >
  Canonical layout standard for authored skills within skill-framework.
  Use when creating, renaming, or auditing a skill folder or structure. Paths use
  <skills-root>/<skill-name>/ rather than a machine-specific root.
---

# Skill Layout Reference

Canonical directory and naming standard for authored skills. Apply it
without consulting another skill's files.

**Why:** `SKILL.md` loads into context on every use; subdirectories load
only when the agent reads a path inside them. Keeping heavy docs and
executable code out of `SKILL.md` preserves context space.

The `skill-framework` defines this reference (see `references/skill-layout.md`)
and applies to all authored skills placed under `<skills-root>/<skill-name>/`.
The framework's other guidance and examples are self-contained and generic.
Authors may externally reference only `skill://writing-skills` and `skill://markdown-quality`.

## Tree

```text
<skills-root>/
  skills-manifest.json         # permitted at skills root; allowed but not required
  <skill-name>/
    SKILL.md                    # required; the only required file
    scripts/                    # executable tools the agent runs
    references/                 # long docs the agent reads on demand
    assets/                     # static config/templates scripts consume
    tests/                      # checks for scripts/
    examples/                   # sample inputs/outputs to imitate
    LICENSE                     # license text for vendored content

Allowed subdirs are exactly: `scripts`, `references`, `tests`, `assets`, `examples`.
A correct minimal skill is `SKILL.md` alone (flat, and complete). There is no
root `README.md`; `SKILL.md` is the entry point.
The permitted `skills-manifest.json` at `<skills-root>/` is allowed but not required; it is not drift.

## Directories

| Dir | What belongs here | Size rule |
| --- | --- | --- |
| `SKILL.md` | overview, when-to-use, rules, pointers to subdirs | ~200-400 words |
| `scripts/` | `*.ts`/`*.py`/`*.sh` the agent runs (`bun`, `python`) | any |
| `references/` | deep docs: API, contracts, formats, quirks | only >~100-line docs |
| `assets/` | config read by scripts (`*.ini`, `*.jsonc`, `*.yml`) | any |
| `tests/` | `*.test.*` covering `scripts/` | any |
| `examples/` | sample input/output showing expected shape | any |

If content fits `SKILL.md` without pushing past ~400 words, keep it inline.
Create a subdir only when it has real content, never speculatively.

**References threshold (normal preference):** Deep docs belong in
`references/` only when they exceed ~100 lines (the normal preference for
long reference material). A narrow allowance exists for short,
independently routed references that a skill's own contract explicitly
requires; do not pad docs to reach the threshold.

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
- anything else: only `SKILL.md`, `LICENSE`, or optional package manifests (`package.json`, lockfiles) may sit at the skill root

Never: a second `README.md` (`SKILL.md` is the entry point); `*.test.*` at the skill root; tracked `node_modules` in any skill.

### Package Manifests and Dependencies

If a skill requires external dependencies and includes a `package.json`:

- It must include `references/dependencies.md` (or instructions in `SKILL.md`) documenting install commands and recovery steps when script execution fails from missing packages.
- `node_modules` must remain untracked and never sync to backup repositories.

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
- Write branches as their own clause (`if X -> step 4`). Step bodies contain one action.
- The final step verifies with an observable result, never summarizes.
- More than ~7 steps -> group under `## Phase: <name>` and number per phase.
- Step detail past ~10 lines moves to `references/<step>.md`; the step keeps
  one line plus the pointer.

## Scope

Applies to manifest `origin: authored` skills. Skills marked `external` keep
upstream layout untouched because reinstalling upstream packages would revert any restructuring.

## Creating a skill

1. `mkdir <skills-root>/<kebab-name>/`
2. Write `SKILL.md` with `name:` equal to the directory.
3. Add subdirectories only when content demands (see Placement).
4. **REQUIRE SUBSKILL:** `markdown-quality` (run auto-fix in AI mode on authored markdown):
   `bun ~/.agents/skills/markdown-quality/scripts/review.ts <skills-root>/<kebab-name>/SKILL.md --fix --mode=ai`
   If `markdown-quality` is unavailable, review formatting manually against Quality Standards without blocking.
5. Register as authored and back up to the sync repo within `skill-framework`
   (see `.ai-sync/manifest.json` workflow. Do not hand-edit the manifest).

## Mirror checklist

Auditing or cloning an existing skill:

1. dir == `name:` == kebab, no forbidden suffix
2. exactly one `SKILL.md`, no `README.md`
3. no loose files at skills root or skill root except the permitted `skills-manifest.json` (allowed, not required)
4. heavy docs in `references/`, code in `scripts/`, tests in `tests/`
5. no tracked `node_modules`; any `package.json` must include install instructions in `references/dependencies.md` or `SKILL.md`
6. passes markdown quality review in AI mode (`bun ~/.agents/skills/markdown-quality/scripts/review.ts <path> --mode=ai`)

## Framework integration rules

- Apply this layout guidance to all authored skills, whether they contain
  executable tools.
- Consuming skills bundle copied primitives and do not import code from
  `skill-framework` at runtime.
- Authors may externally reference only `skill://writing-skills` and `skill://markdown-quality`. All other guidance and examples must be self-contained and generic.
- External skill cross-references (scripts or `skill://` URIs) must start with `**REQUIRE SUBSKILL:** <name>`.
- Every subskill reference must specify a non-blocking fallback action if missing or unreadable. Workflows must proceed without stalling.
- Mutating and destructive tools must preview actions by default and require explicit flags (such as `--apply` or `--confirm`) to execute mutations.
- Authored CLI tools must provide dual-mode logging: tree logs for human terminals and structured JSON when callers pass `--format=json`.
- The framework does not add a root `README.md`, shared runtime package, or code-distribution generator.
- Repository policy edits stay within the existing `.ai-sync/manifest.json`
  workflow.

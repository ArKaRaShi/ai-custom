# Tool & Rule Reference

Detailed lookup for the three review passes.

## Contents

- [1. Standards: `markdownlint-cli2`](#1-standards-markdownlint-cli2)
- [2. Prose: `Vale`](#2-prose-vale)
- [3. AI-Tells and Slop](#3-ai-tells-and-slop-vale-with-ai-tells-and-ai-tells-commits)
- [4. Stop Conditions](#4-stop-conditions)
- [5. Common False Positives](#5-common-false-positives)

<!-- vale off -->

## 1. Standards: `markdownlint-cli2`

Wrapper (v0.22.x) around `markdownlint` with config-file lookup, nested overrides, auto-fix, and JSON output.

### Key rules to know

| Rule | Purpose | Severity |
| --- | --- | --- |
| MD001 | Heading levels increment by one | error |
| MD003 | Heading style (ATX/setext) | configurable |
| MD004 | Unordered list style | warning |
| MD007 | UL indent | warning |
| MD009 | No trailing spaces | warning |
| MD012 | No multiple blank lines | warning |
| MD013 | Line length (disabled in our config) | disabled |
| MD022 | Blanks around headings | warning |
| MD024 | Duplicate heading text (`siblings_only: true`) | error |
| MD025 | Single H1 in document | warning |
| MD026 | No trailing punctuation in headings | warning |
| MD029 | Ordered list item prefix ordered | warning |
| MD033 | Inline HTML (allowlist in our config) | warning |
| MD034 | Bare URL used | warning |
| MD036 | No emphasis as heading | warning |
| MD040 | Fenced code has language | warning |
| MD041 | First line is top-level heading | disabled |
| MD046 | Code-block style (fenced) | configurable |
| MD048 | Code-fence style consistent | warning |
| MD049 | Emphasis style `_` vs `*` | warning |
| MD050 | Strong style `**` vs `__` | warning |

Full list: <https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md>

### Common invocations

```bash
# Check
npx -y markdownlint-cli2 "**/*.md" "#node_modules"

# Auto-fix safe structural issues (headings, blanks, lists, fences)
npx -y markdownlint-cli2 --fix "**/*.md" "#node_modules"

# JSON for tooling
npx -y markdownlint-cli2 --json "**/*.md"

# Lint a single file with explicit config
npx -y markdownlint-cli2 --config .markdownlint-cli2.jsonc README.md
```

### Per-directory overrides

Drop a `.markdownlint-cli2.jsonc` in any subdir to override rules locally. CLI merges them up the tree.

## 2. Prose: `Vale`

Single Go binary replacing `write-good`, `proselint`, `alex`, and `readability` in one tool.

### Bundled styles (all from `vale-cli/*` org on GitHub)

| Style | Targets | Notes |
| --- | --- | --- |
| `Vale` | Built-in capitalization, repetition, spelling | Always on |
| `write-good` | weasel, passive, adverb, cliché, lexical illusions | btford port |
| `proselint` | jargon, hedging, malapropisms, redundancy, typography | 100+ checks |
| `alex` | inclusive / non-ableist language | retext-equality port |
| `Readability` | Flesch, Flesch-Kincaid, Gunning Fog, SMOG, AARI | per-paragraph |

### Check types

| Type | What it does |
| --- | --- |
| `existence` | Regex match -> emit finding |
| `substitution` | Suggest replacement |
| `occurrence` | Count matches in scope (e.g. word frequency) |
| `repetition` | Built-in (`Vale.Repetition`) |
| `consistency` | Same word, different form across doc |
| `conditional` | Triggered by context (e.g. only in headings) |
| `capitalization` | Built-in |
| `metric` | Readability score thresholds |
| `spelling` | Hunspell-compatible dictionary |
| `sequence` | Ordered pattern match |
| `script` | Tengo-scripted custom logic |

### Common invocations

```bash
# Human-readable line output
vale --config .vale.ini "docs/**/*.md"

# JSON for tooling
vale --config .vale.ini --output=JSON "docs/**/*.md" > vale.json

# Only errors (skip warnings/suggestions)
vale --config .vale.ini --minAlertLevel=error "docs/**/*.md"

# Specific style only
vale --config .vale.ini --filter='write-good.*' "docs/**/*.md"
```

### Disable inline

```markdown
<!-- vale off -->
This paragraph is exempt from Vale.
<!-- vale on -->
```

Or per-rule: `<!-- vale write-good.weasel off -->`.

### Custom rules (see `assets/.vale/styles/Bloat/`)

YAML rule structure:

```yaml
extends: existence
message: "Human-readable message"
level: error | warning | suggestion
scope: paragraph | heading | sentence | raw
nonword: true          # use \b word boundaries
tokens:
  - regex1
  - regex2
ignorecase: true
```

`scope: raw` is needed for structural checks (list depth, empty sections).

## 3. AI-Tells and Slop: `Vale` with `ai-tells` and `ai-tells-commits`

`ai-tells` (`tbhb/vale-ai-tells`, 137 rules) detects fingerprints of AI-written prose. `ai-tells-commits` (15 rules) detects them in commit messages and PR text. Both ship every rule at `error`. The review demotes their alerts to warnings, so they never block.

| Mode | `ai-tells` | `ai-tells-commits` |
| --- | --- | --- |
| `agent` | Allowlist in `assets/modes/agent/.vale.ini`: padding, filler, hedging, pleasantries, puffery, AI vocabulary, figurative and anthropomorphic wording | Off |
| `human` | Every rule | `COMMIT_EDITMSG`, `*.commit.md`, `*.commit.txt`, `*.pr.md`, `*.pr.txt`, and `--text` with `--commit` |

Agent mode lists each enabled rule as `ai-tells.<Rule> = YES` and leaves the package out of `BasedOnStyles`. A package update then adds no rule to agent mode until the list names it. Vale ignores an unknown rule name, so a test checks that every listed rule exists.

`ai-tells-commits` is vendored from the `tbhb/vale-ai-tells` v1.37.0 release asset `ai-tells-commits.zip`. It is not in the Vale package catalog. Extract the zip into `assets/.vale/styles/` to update it.

### Rule families

- `OpeningCliches`: "in today's fast-paced world", "in an era where", "embarking on a journey"
- `OverusedVocabulary`: "delve", "tapestry", "multifaceted", "plethora", "beacon", "testament"
- `OverusedVocabularyVerbs`: "leverage", "foster", "streamline", "embark"
- `SycophancyMarkers`: "Great question!", "Certainly!", "Of course!"
- `EmptyPadding`: "various", "certain", "particular" before a noun
- `HedgingPhrases`: "It is important to note that"
- `ConclusionMarkers`: "in conclusion", "ultimately", "to summarize"
- `EmDashUsage`, `SemicolonUsage`, `ColonUsage`: punctuation tells (human mode only)
- `CommitSelfReference`: "This commit introduces", "This PR adds" (`ai-tells-commits`, human mode only)

### Common invocations

```bash
# Check with global user-level Vale rules
vale "**/*.md"

# Filter by minimum alert level
vale --minAlertLevel=error "**/*.md"
```

## 4. Stop Conditions

The review is complete when:

- `markdownlint-cli2` exits 0
- `vale` reports 0 errors at configured `MinAlertLevel`. `ai-tells` and `ai-tells-commits` alerts never count as errors
- Or the user has explicitly accepted the remaining findings

Do not loop "fixing" things that have been explicitly accepted.

## 5. Common False Positives

| Tool | False positive | Suppress with |
| --- | --- | --- |
| Vale `weasel` | "very" in "very important bug fix" | `<!-- vale write-good.weasel off -->` |
| Vale `passive` | "is documented in" | per-line disable |
| `write-good` `so` | "so that" at start of sentence | context-dependent |
| `proselint` `jargon` | Domain terms (e.g. "idempotent") | extend `Vale.AcceptedWords` |
| `markdownlint` MD024 | Two sections legitimately share a heading | `siblings_only: true` already handles this |
| Vale `ai-tells` | Legitimate technical term | `<!-- vale ai-tells.OverusedVocabulary off -->` |

<!-- vale on -->

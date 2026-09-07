# Tool & Rule Reference

Detailed lookup for the three review passes.

## 1. Standards — `markdownlint-cli2` v0.22.x

Wrapper around `markdownlint` with config-file lookup, nested overrides, auto-fix, JSON output.

### Key rules to know

| Rule | Purpose | Severity |
|---|---|---|
| MD001 | Heading levels increment by one | error |
| MD003 | Heading style (ATX/setext) | configurable |
| MD004 | Unordered list style | warning |
| MD007 | UL indent | warning |
| MD009 | No trailing spaces | warning |
| MD012 | No multiple blank lines | warning |
| MD013 | Line length (disabled in our config — trust Vale) | — |
| MD022 | Blanks around headings | warning |
| MD024 | Duplicate heading text (`siblings_only: true`) | error |
| MD025 | Single H1 in document | warning |
| MD026 | No trailing punctuation in headings | warning |
| MD029 | Ordered list item prefix ordered | warning |
| MD033 | Inline HTML (allowlist in our config) | warning |
| MD034 | Bare URL used | warning |
| MD036 | No emphasis as heading | warning |
| MD040 | Fenced code has language | warning |
| MD041 | First line is top-level heading (we disable — too strict) | — |
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

## 2. Prose — `Vale` v3.14.x

Single Go binary. Replaces `write-good` + `proselint` + `alex` + `readability` in one tool.

### Bundled styles (all from `vale-cli/*` org on GitHub)

| Style | Targets | Notes |
|---|---|---|
| `Vale` | Built-in capitalization, repetition, spelling | Always on |
| `write-good` | weasel, passive, adverb, cliché, lexical illusions | btford port |
| `proselint` | jargon, hedging, malapropisms, redundancy, typography | 100+ checks |
| `alex` | inclusive / non-ableist language | retext-equality port |
| `Readability` | Flesch, Flesch–Kincaid, Gunning Fog, SMOG, AARI | per-paragraph |

### Check types

| Type | What it does |
|---|---|
| `existence` | Regex match → emit finding |
| `substitution` | Suggest replacement |
| `occurrence` | Count matches in scope (e.g. word frequency) |
| `repetition` | Built-in (`Vale.Repetition`) — duplicate words / phrases |
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

### Custom rules (see `assets/Bloat.yml`)

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

## 3. AI-Tells & Slop — `Vale` with `ai-tells` (110+ rules)

Official Vale style package (`tbhb/vale-ai-tells`) that detects 110+ AI-generated prose fingerprints and clichés.

### Rule families

- `OpeningCliches` — "in today's fast-paced world", "in an era where", "embarking on a journey"
- `OverusedVocabulary` — "delve", "tapestry", "multifaceted", "plethora", "beacon", "testament"
- `OverusedVocabularyVerbs` — "leverage", "foster", "streamline", "embark"
- `SycophancyMarkers` — "Great question!", "Certainly!", "Of course!"
- `EmptyPadding` — "it is worth noting that", "it is important to remember that"
- `ConclusionMarkers` — "in conclusion", "ultimately", "to summarize"
- `EmDashUsage` — excessive em-dashes (`—`) used as dramatic punctuation

### Common invocations

```bash
# Check with global user-level Vale rules
vale "**/*.md"

# Filter by minimum alert level
vale --minAlertLevel=error "**/*.md"
```

## 4. Stop Conditions

The review is **done** when:

- `markdownlint-cli2` exits 0
- `vale` reports 0 errors at configured `MinAlertLevel` (including `ai-tells`)
- Or the user has explicitly accepted the remaining findings

Do not loop "fixing" things that have been explicitly accepted.

## 5. Common False Positives

| Tool | False positive | Suppress with |
|---|---|---|
| Vale `weasel` | "very" in "very important bug fix" | `<!-- vale write-good.weasel off -->` |
| Vale `passive` | "is documented in" | per-line disable |
| `write-good` `so` | "so that" at start of sentence | context-dependent |
| `proselint` `jargon` | Domain terms (e.g. "idempotent") | extend `Vale.AcceptedWords` |
| `markdownlint` MD024 | Two sections legitimately share a heading under different parents | `siblings_only: true` already handles this |
| Vale `ai-tells` | Legitimate use of technical term (e.g. "dynamic") | `<!-- vale ai-tells.OverusedVocabulary off -->` |

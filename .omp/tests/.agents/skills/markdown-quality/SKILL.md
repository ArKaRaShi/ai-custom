---
name: markdown-quality
description: Use when creating, editing, formatting, reviewing, or validating Markdown files, documentation, READMEs, or agent instruction files (AGENTS.md, CLAUDE.md)
---

# Markdown Quality & Optimization

Two-layer quality standard for Markdown: deterministic structural validation and auto-fixing via `markdownlint-cli2`, followed by prose and semantic AI-context optimization via `Vale` and cognitive contracting.

## When to Use

- After creating or editing any `.md` file, guide, or documentation.
- When drafting or updating agent instruction files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`).
- Pre-commit or pre-PR documentation reviews.
- When optimizing token efficiency and context clarity for AI agents.

## When NOT to Use

- For non-Markdown source code files (Python, TypeScript, SQL).
- For pure code refactoring (use code linters and language servers instead).

## Quick Reference

Always resolve the skill directory with an overridable fallback:

```bash
SKILL_DIR="${SKILL_DIR:-$HOME/.agents/skills/markdown-quality}"

# 1. Instant structural auto-fix (whitespace, blank lines, headings)
"$SKILL_DIR/scripts/fix.sh" "<file.md>"

# 2. Full QA scorecard (standards + prose + AI-tells)
"$SKILL_DIR/scripts/review.sh" "<file.md>"

# 3. Full QA scorecard with automatic structural fixes applied
"$SKILL_DIR/scripts/review.sh" "<file.md>" --fix
```

## Prerequisites & Installation

Before running checks, verify that the required CLI tools are installed via Homebrew:

### 1. Unified Installation via Homebrew (macOS)

Both tools are managed natively under Homebrew:

```bash
which markdownlint-cli2 >/dev/null 2>&1 && which vale >/dev/null 2>&1 || brew install markdownlint-cli2 vale
```

### 2. Global Base Configuration (`~/.markdownlint-cli2.yaml`)

If the user-level configuration is missing, initialize it once to prevent false-positive 80-character line-length errors across projects:

```bash
test -f ~/.markdownlint-cli2.yaml || cat << 'EOF' > ~/.markdownlint-cli2.yaml
config:
  default: true
  MD013: false # disable strict 80-char line length
  MD033: false # allow inline HTML (<details>, <summary>)
  MD041: false # allow files to start with H2 or frontmatter
  MD024:
    siblings_only: true
  MD034: false # allow bare URLs
  MD029: false # allow flexible ordered lists
  MD036: false # allow emphasis
ignores:
  - "node_modules/**"
  - ".git/**"
  - ".venv*/**"
  - "dist/**"
  - "build/**"
EOF
```

---

## Layer 1: Structural Standards (Tool-Enforced)

Automated CLI checks that prevent broken Markdown AST parsing, table misalignment, and tokenizer context splitting.

Run auto-fix directly:

```bash
SKILL_DIR="${SKILL_DIR:-$HOME/.agents/skills/markdown-quality}"
"$SKILL_DIR/scripts/fix.sh" "<target.md>"
```

### Non-Negotiable Invariants

1. **`MD040` — Explicit Code Fence Language**: Every code block must specify a language identifier (e.g. ````bash`,````python`, ````text`, ````json`). Never leave backticks bare.
2. **`MD031` / `MD032` — Blanks Around Fences and Lists**: Code blocks and list items must have empty lines before and after.
3. **`MD018` — Single Space After Heading Hash**: Use `## Heading`, never `##Heading`.
4. **Plain Text Symbols**: Use clean arrows `->` or Unicode `→`, never unrendered LaTeX `$\rightarrow$` in standard documentation.

---

## Layer 2: Prose & Semantic AI Context (Agent-Evaluated)

Cognitive review applied by the agent to ensure documentation is dense, unambiguous, and token-efficient for LLMs and human engineers.

### Five Semantic Criteria

#### 1. Positive Recipes Over Vague Prohibitions

State the concrete shape of what should exist rather than loose negative rules.

- ❌ *Vague:* "Don't write complex functions and avoid huge files."
- ✅ *Recipe:* "Functions must stay under 40 lines. Use early-return guard clauses."

#### 2. Executable Verification Command

Conclude every rule, setup guide, or domain doc with a runnable command so agents can self-verify before claiming completion:

```bash
.venv-app/bin/python manage.py check
```

#### 3. Table Compaction for Multi-Variable Data

Convert narrative paragraphs into compact Markdown tables. Tables prevent hallucination and make lookup instantaneous:

| Entity | Storage Engine | Qualification | Example |
| --- | --- | --- | --- |
| Sensor Readings | TimescaleDB | Subclasses `TimescaleModel` | `UmhIndicatorTimeSeries` |
| Asset Metadata | MySQL (`default`) | Standard `models.Model` | `anomaly.SensorData` |

#### 4. Token Density & Zero Slop

- Eliminate conversational filler ("Let's dive in", "It is worth noting that").
- Eliminate ASCII art banners (`+---+`, `|===|`), which tokenizers fragment into dozens of disjointed tokens.

#### 5. Progressive Disclosure

Keep root instruction files (`AGENTS.md`) concise. Link to domain documentation instead of dumping monolithic 500-line walls of text.

---

## Concrete Comparison

### ❌ Fails Both Layers (Syntax Errors + Semantic Slop)

````markdown
## Database Details
Our platform uses several databases for storing things. Some stuff goes into timeseries, but other stuff is in MySQL.
```
print("testing")
```
Try to write clean queries and avoid putting sensor data in the wrong database.
````

### ✅ Passes Both Layers (Clean Syntax + Deterministic Contract)

````markdown
## Database Routing

| Target DB | Base Class | Fields | Example |
|---|---|---|---|
| `timescaledb` | `TimescaleModel` | `TimescaleDateTimeField` | `UmhIndicatorTimeSeries` |
| `default` (MySQL) | `models.Model` | Standard ORM fields / FK | `anomaly.SensorData` |

### Verification Command
```bash
.venv-app/bin/python manage.py shell -c "from apm.routers import TimescaleDBRouter; from <app>.models import <Model>; print(TimescaleDBRouter().db_for_read(<Model>) or 'default')"
```
````

---

## Rationalizations & Red Flags

| Excuse | Reality |
| --- | --- |
| "It's just documentation, formatting doesn't matter" | Malformed tables and unclosed code blocks silently break LLM chunking, tool parsers, and IDE previews. |
| "I'll manually eyeball spacing and headings" | Automated CLI checks catch trailing spaces and list indentations that human eyes miss. |
| "The review script takes too long" | `scripts/fix.sh` executes in <0.2 seconds and automatically repairs 90% of formatting errors. |

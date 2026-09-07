---
name: markdown-quality
description: Use when creating, editing, formatting, reviewing, or validating Markdown files, documentation, READMEs, or agent instruction files (AGENTS.md, CLAUDE.md)
---

# Markdown Quality & Optimization

Multi-layer quality standard: structural validation/auto-fixing via `markdownlint-cli2`, prose/AI-tells review via `Vale`, link integrity, and token density/bloat analysis.

## When to Use

- After creating or editing any `.md` file, guide, or documentation.
- When drafting or updating agent instruction files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`).
- Pre-commit or pre-PR documentation reviews.
- When improving token efficiency and context clarity for AI agents.

## When NOT to Use

- For non-Markdown source code files (Python, TypeScript, SQL).
- For pure code refactoring (use code linters and language servers).

## Quick Reference

Run directly with `bun`:

```bash
SKILL_DIR="${SKILL_DIR:-$HOME/.agents/skills/markdown-quality}"

# 1. Instant structural auto-fix (whitespace, blank lines, headings)
bun "$SKILL_DIR/scripts/fix.ts" "<file.md>"

# 2. Full QA scorecard (standards + prose + link integrity + token density)
bun "$SKILL_DIR/scripts/review.ts" "<file.md>"

# 3. Full QA scorecard with automatic structural fixes applied
bun "$SKILL_DIR/scripts/review.ts" "<file.md>" --fix
```

## Quality Standards

### 1. Structural Invariants (Tool-Enforced)

- **Code Fences (`MD040`):** specify explicit language tag (`bash`, `python`, `text`, `json`). Never leave bare.
- **Spacing (`MD031` / `MD032`):** empty lines before and after code fences and lists.
- **Headings (`MD018`):** single space after `#` (`## Heading`).
- **Symbols:** use plain text arrows (`->` or `→`), not raw LaTeX.

### 2. Semantic & AI Context Quality

- **Positive Recipes:** state exact concrete rules over vague prohibitions.
- **Verification Commands:** end technical docs with runnable test/check commands.
- **Tables Over Narrative:** compact multi-variable descriptions into markdown tables.
- **Token Density:** remove conversational filler phrases and drop ASCII art banners.
- **Link Integrity:** verify relative file paths (`./doc.md`) and heading anchors (`#section`).

## Rationalizations & Red Flags

| Excuse | Reality |
| --- | --- |
| "It's just documentation, formatting doesn't matter" | Malformed tables and unclosed code blocks break LLM chunking, tool parsers, and IDE previews. |
| "I'll manually eyeball spacing and headings" | Automated CLI checks catch trailing spaces and list indentations that human eyes miss. |
| "The review script takes too long" | `scripts/fix.ts` executes in <0.2s and automatically repairs 90% of formatting errors. |
| "Running the script in python eval/notebook" | `.ts` scripts are TypeScript CLI executables run with `bun`. Run with `bun "$SKILL_DIR/scripts/fix.ts"`. |

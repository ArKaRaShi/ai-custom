---
name: linting-markdown
description: Use when creating, editing, formatting, or validating Markdown files, project documentation, READMEs, or agent configuration files (AGENTS.md, CLAUDE.md)
---

# Linting Markdown

## Overview
Enforce clean Markdown syntax, deterministic formatting, and reliable document structure using `markdownlint-cli2` backed by user-level base configuration.

## When to Use
- After authoring or modifying any Markdown file (`.md`), specification, or guide.
- When editing agent configuration or instruction files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`).
- Before completing tasks that touch repository documentation.

## When NOT to Use
- Non-Markdown files (Python, JSON, YAML, code).
- For spell-checking or prose tone analysis (use prose style linters like Vale).

## Quick Reference

| Action | Command |
|---|---|
| **Audit single file** | `markdownlint-cli2 --config ~/.markdownlint-cli2.yaml "<file.md>"` |
| **Auto-fix single file** | `markdownlint-cli2 --config ~/.markdownlint-cli2.yaml --fix "<file.md>"` |
| **Audit workspace** | `markdownlint-cli2 --config ~/.markdownlint-cli2.yaml "**/*.md"` |
| **Auto-fix workspace** | `markdownlint-cli2 --config ~/.markdownlint-cli2.yaml --fix "**/*.md"` |

## Workflow

1. **Audit**: Run `markdownlint-cli2 --config ~/.markdownlint-cli2.yaml <target.md>`.
2. **Auto-Fix**: If fixable formatting issues exist (spacing, blank lines around lists, indentation), run with `--fix`.
3. **Manual Resolution**: Fix structural or semantic issues that `--fix` cannot alter safely (such as unlabeled code fences).
4. **Verify**: Re-run the audit command to confirm `Summary: 0 issues in 1 file`.

## Common Violations & Fixes

### 1. `MD040` — `fenced-code-language`
Every code block must specify an explicit language identifier. Never leave backticks bare.

*Incorrect:*
````markdown
```
print("hello")
```
````

*Correct:*
````markdown
```python
print("hello")
```
````
*(Use `text` for plain output/logs, `bash` for commands, `json`, `yaml`, etc.)*

### 2. `MD031` — `blanks-around-fences`
Code fences must have an empty line before and after.

*Incorrect:*
````markdown
Run this:
```bash
echo "hi"
```
Next step.
````

*Correct:*
````markdown
Run this:

```bash
echo "hi"
```

Next step.
````

### 3. `MD018` — `no-missing-space-atx`
Headings require a space after the `#` symbols.

*Incorrect:* `##Section Title`
*Correct:* `## Section Title`

### 4. Unrendered Math Symbols
Avoid unrendered LaTeX expressions like `$\rightarrow$` in standard Markdown text; use clean text arrows `->` or Unicode `→`.

## Rationalizations & Red Flags

| Excuse | Reality |
|---|---|
| "Formatting doesn't affect code execution" | Broken code fences and malformed tables corrupt LLM chunking, context caching, and IDE preview renders. |
| "I'll manually check spacing" | Humans and agents consistently miss trailing whitespace and fence spacing. Use the automated CLI check. |
| "The command is too verbose" | Copy the single line from the Quick Reference table; it runs in <0.2 seconds. |

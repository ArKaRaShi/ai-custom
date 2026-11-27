---
name: adding-lint-rules
description: Lint rules and the convention docs their messages link to. Use when adding or changing a custom check or a built-in linter rule, or when renaming or rewriting a doc section that a lint message points at.
---

# Adding Lint Rules

Produces a lint rule that detects one named mistake, prints a message linking the doc section that shows the fix, and is pinned by fixtures.

## Steps

1. Read the repo's lint map. When the repo has none, copy `assets/lint-map-template.md` into the repo's agent docs and fill each slot from the repo, writing `none` for a slot the repo lacks. Exit: you can name the built-in tool config, custom check folder, registry, message helper, test folder, doc folder, rules table and run command.
2. Write the mistake as one line, then search the installed linters for it (see [Built-ins first](#built-ins-first)). Exit: a built-in rule is configured, or the one-line gap no built-in covers is written into the new check's module docstring.
3. Write the fix guide from `assets/convention-doc-template.md`, in the map's doc folder (see [Doc placement](#doc-placement)). Exit: the section the message will link exists with its four parts, and you know its anchor.
4. Write the check from the template for the language, and register it in the map's registry. Exit: every finding prints `<symptom>; <action> (<doc>#<anchor>)`, through the map's message helper when it has one.
5. Pin it with the matching test template. Exit: one hit, one silence and one exemption pass through the check's real entry point.
6. Run the check on a throwaway file, read the printed line, delete the file, then run `bun <this skill>/scripts/check-doc-links.ts --root <repo> <check folder> <doc folder>`. Exit: the printed line reads alone (fault, value, action, doc) and the script prints `No dead doc links.`
7. Add the rule's row to the map's rules table. Exit: the row names the rule, its doc, the command that enforces it, and its state.

## Reference

### Built-ins first

A configured built-in rule beats a hand-written check: editors, CI and autofix already understand it.

| Language | Look first |
| --- | --- |
| Python | `ruff rule --all \| grep -i <topic>`; `flake8-tidy-imports` banned-api (`TID251`) for a forbidden import or call; pyright settings |
| TypeScript, JavaScript | ESLint core and installed plugins; `no-restricted-syntax` with an AST selector; `no-restricted-imports` |

Write a custom check only for a gap you can state in one line, and record that line in the check's docstring.

### Doc placement

- Extend the doc that already owns the convention. Create `<doc folder>/<topic>.md` only when no doc owns it, and name it for the convention (`error-handling.md`), not the check (`check-errors.md`).
- Give each rule whose fix differs its own section and anchor, so a message lands on its fix.
- The doc describes the checker's actual scope. When the checker exempts a case, the doc names that exemption. A doc stricter or looser than its checker sends the reader to the wrong fix.
- A fix guide has four parts: when to fix, the pattern with a paired example, the exemptions that keep the rule quiet, and the escape hatch for a confirmed one-off.

### Anchors are an interface

A heading that a lint message links is part of the check's output. Renaming or deleting it breaks every finding of that rule without failing anything. After editing a doc in the map's doc folder, run `check-doc-links.ts`, and change the check, its test and any guidance table in the same edit.

### Message

`<symptom>; <action> (<doc>#<anchor>)`. Example: `compares against "running" in a comparison; declare a StrEnum member for the state (docs/conventions/state-values.md#fixed-sets)`.

- Symptom: the fault plus the offending value.
- Action: imperative, naming what to write.
- Doc: the repo-relative path with the anchor of the section that shows the fix.

When the repo has a report standard (a slot in the lint map), its format wins.

### Templates

| File | Step | Use |
| --- | --- | --- |
| `assets/lint-map-template.md` | 1 | A repo with no lint map |
| `assets/convention-doc-template.md` | 3 | A new doc or section |
| `assets/check-python-template.py`, `assets/check-python-test-template.py` | 4, 5 | A custom Python check (stdlib `ast`, pytest) |
| `assets/check-ts-template.ts`, `assets/check-ts-test-template.ts` | 4, 5 | A custom TypeScript check (`bun:test`; needs `typescript@5` as a dev dependency, because TypeScript 7 ships no JavaScript compiler API) |

Each check template ships a working sample rule (a `print` call, a `console.log` call). Replace the sample visitor, constants and fixtures; keep the skip list, the reasoned suppression and the message shape.

### Scripts

`scripts/check-doc-links.ts` needs Bun 1.1 or later (`brew install oven-sh/bun/bun`). Run it; it only reads. It scans `.py`, `.ts`, `.tsx`, `.js`, `.vue`, `.json` and `.md` files for `<path>.md#<anchor>`. A path resolves relative to its own file, then the repo root, then to every Markdown file ending in it, so a link built in an f-string (`f"{DOCS}/topic.md#rule"`) still resolves; the link is live when any candidate has the anchor. Exit 0 clean, 1 on a dead link, 2 on a usage error.

### Local-only tooling

When the lint map says the repo's lint tooling is local (git-ignored), keep the new rule in those paths and leave tracked config and CI unchanged until the user asks to promote it.

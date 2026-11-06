---
name: writing-markdown
description: Use when authoring, structuring, or updating Markdown documentation, instructions, context notes, runbooks, architecture decision records, or technical guides for AI consumption
disable-model-invocation: true
---

# Writing Markdown

Standard for authoring token-dense, machine-readable Markdown documentation consumed by AI agents.

**REQUIRE SUBSKILL:** `markdown-quality` (`skill://markdown-quality`). If `markdown-quality` is unavailable, review formatting and links manually against this standard.

> **Index:**
>
> | Section | Anchor |
> | :--- | :--- |
> | When to Use | [#when-to-use](#when-to-use) |
> | When NOT to Use | [#when-not-to-use](#when-not-to-use) |
> | Quick Reference | [#quick-reference](#quick-reference) |
> | Core Invariants | [#core-invariants](#core-invariants) |
> | Verification | [#verification](#verification) |

## When to Use

- Writing or updating `AGENTS.md`, `CONTEXT.md`, or architecture decision records.
- Creating operational runbooks, developer playbooks, or troubleshooting procedures.
- Documenting engineering conventions, calculation formulas, or database routing.
- Structuring directories under `docs/` and writing directory index files.

## When NOT to Use

- Non-Markdown source code files (`.py`, `.ts`, `.sql`).
- Ephemeral chat responses or throwaway terminal notes.

## Quick Reference

| Topic | Reference Document | Key Contract |
| --- | --- | --- |
| Paired examples | [`references/paired-examples.md`](references/paired-examples.md) | Mandatory `# Avoid:` and `# Prefer:` blocks with failure rationale |
| Document types | [`references/document-types.md`](references/document-types.md) | Standard sections for instructions, context, decision records, and runbooks |
| Directory tree | [`references/directory-architecture.md`](references/directory-architecture.md) | Index-first rule (`README.md`), search anchors, relative links |
| Token efficiency | [`references/token-efficiency.md`](references/token-efficiency.md) | Table conversions, dead phrase elimination, imperative verbs |

## Core Invariants

Apply these five invariants across every Markdown file:

1. **High semantic density:** delete conversational preambles and polite filler words.
2. **Explicit invariants:** replace soft advice with strict RFC 2119 imperatives (`MUST`, `NEVER`).
3. **Paired examples:** every documented code pattern must pair `# Avoid:` with `# Prefer:` and state the concrete failure risk.
4. **Index-first navigation:** every docs directory MUST provide an index `README.md` with relative links to files and relevant section anchors.
5. **Terminal verification:** every operational procedure must conclude with an executable verification command.

## Verification

After authoring or editing Markdown files, audit the files with `markdown-quality` in `agent` mode:

```bash
bun ~/.agents/skills/markdown-quality/scripts/review.ts <file-or-dir> --mode=agent
```

The review must return clean with no errors or broken links.

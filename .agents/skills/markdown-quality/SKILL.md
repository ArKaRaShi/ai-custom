---
name: markdown-quality
description: Review existing Markdown files for three quality criteria — efficiency (no bloat, no redundancy), standards (heading hierarchy, link validity, code-fence languages, list indentation), and conciseness (no fluff, no AI-slop, no weasel words). Wraps `markdownlint-cli2` (structure), `Vale` (prose + readability + repetition), and optionally `slopless` (AI-slop). Use when auditing, reviewing, or QA-ing existing `.md`/`.mdx` files in any repo. Triggers on requests like "review my markdown", "check this doc for quality", "is this doc bloated", "lint my docs", or "tighten this README".
---

# Markdown Quality Review

Review-only audit pass for existing Markdown. Never silently rewrites; produces a structured report and optional auto-fix diff.

## When To Use

- Reviewing/auditing an existing `.md` or `.mdx` file
- Checking a doc for bloat, redundancy, or AI-slop
- Pre-commit / pre-PR doc QA
- Bulk audit of `docs/**` or `README.md`

## When NOT To Use

- Writing a new doc from scratch → use `markdown-writing`
- Fixing prose in a non-Markdown file → use `copy-editing` or `writing-clearly-and-concisely`
- Single typo / single link fix → just edit it

## Three Criteria

| Criterion | What it means | Tool |
|---|---|---|
| **Standards** | Heading hierarchy, link validity, code-fence langs, list indent, no duplicate headings | `markdownlint-cli2` |
| **Conciseness** | No fluff, no weasel words, no passive voice, no clichés, no AI-slop | `Vale` (`write-good`+`proselint`+`alex`) + optional `slopless` |
| **Efficiency** | No repetition, no oversized paragraphs, no empty sections, good readability | `Vale` (`Readability`+`Repetition`+ custom `Bloat.yml`) |

## Workflow

```
inputs:  paths (globs), severity threshold, --fix flag
                │
                ▼
   ┌────────────────────────────┐
   │ 1. Standards  (auto-fix?)   │  markdownlint-cli2
   ├────────────────────────────┤
   │ 2. Prose      (Vale)        │  write-good + proselint + alex
   ├────────────────────────────┤
   │ 3. Bloat      (Vale + cus)  │  Readability + Repetition + Bloat.yml
   ├────────────────────────────┤
   │ 4. AI-Slop    (optional)    │  slopless preset
   └────────────────────────────┘
                │
                ▼
   report: ✅ keep  ⚠️ tighten  ❌ cut
```

## Run

Use the bundled runner — it handles all three passes and aggregates output:

```bash
~/.agents/skills/markdown-quality/scripts/review.sh "**/*.md"
```

Add `--fix` to apply auto-fixes from `markdownlint-cli2` (only safe structural changes). Never `--fix` prose.

## Output Format

For each finding emit one line:

```
[LINT] path/to/file.md:42 [MD024] Duplicate heading under same parent
[VALE] path/to/file.md:18 [write-good.weasel] "very" is a weasel word
[SLOP] path/to/file.md:7  [boilerplate-framing] "Let me be honest..." (slop)
[REPT] path/to/file.md:33 [Vale.Repetition] "the the" appears twice
```

Then a verdict block:

```
SUMMARY
  Standards:  3 errors, 5 warnings
  Conciseness: 2 errors, 8 warnings
  Efficiency:  0 errors, 1 warning
  AI-Slop:     4 hits (if run)
  ─────────────────────────────────
  VERDICT: ⚠️  needs tightening — 2 errors must be fixed
```

## What This Skill Does NOT Do

- Rewrite the file silently
- Modify prose (Vale/slopless are report-only)
- Commit, push, or open PRs
- Install the underlying tools (user runs `npm i -D` themselves)

## Setup

The skill assumes the tools are reachable via `npx`. To install:

```bash
npm i -D markdownlint-cli2 vale
npm i -D slopless   # optional
```

Then copy the bundled config files into the repo root:

```bash
cp ~/.agents/skills/markdown-quality/assets/.markdownlint-cli2.jsonc ./
cp ~/.agents/skills/markdown-quality/assets/.vale.ini ./
mkdir -p .vale/styles
cp ~/.agents/skills/markdown-quality/assets/Bloat.yml ./.vale/styles/
```

## References

- Detailed tool/rule reference: [references/tool-reference.md](references/tool-reference.md)
- Pre-commit / CI snippets: [references/ci-integration.md](references/ci-integration.md)

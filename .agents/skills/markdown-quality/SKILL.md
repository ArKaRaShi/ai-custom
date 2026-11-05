---
name: markdown-quality
description: Markdown QA. Use when creating, editing, formatting, reviewing, or validating Markdown files, documentation, READMEs, agent instruction files (AGENTS.md, CLAUDE.md), commit messages, or PR text. Skip for source code.
---

# Markdown Quality

Produces Markdown that passes structure, prose, link, security, and token-density checks for its reader, a model or a person.

## Steps

1. Pick the mode by who reads the text: `agent` for a model (AGENTS.md, skills, prompts), `human` for a person (README, docs, commit messages, PR text). Exit: you chose `agent` or `human`.
2. Auto-fix structure: `bun "$HOME/.agents/skills/markdown-quality/scripts/fix.ts" "<file-or-dir>" --mode=<mode>`. Exit: `Result: CLEAN`, or the output lists the remaining issues.
3. Review: `bun "$HOME/.agents/skills/markdown-quality/scripts/review.ts" "<file-or-dir>" --mode=<mode>`. Exit: `Result: CLEAN`.
4. For commit or PR text, review in human mode with the commit rules. Name the file `COMMIT_EDITMSG`, `*.commit.md`, `*.commit.txt`, `*.pr.md`, or `*.pr.txt`, or pass inline text with `--commit`: `review.ts --mode=human --commit --text="<message>"`. Exit: zero `ai-tells-commits` warnings remain, or you accepted each one.
5. Fix each warning by rewriting the sentence. Accept a warning only when the flagged wording is a real term; then suppress it inline with `<!-- vale <Style.Rule> off -->`. Exit: zero warnings remain, or you accepted each one.

Other options: `--fix` runs auto-fix and review together, `--verbose` prints every finding (the tree shows 15 per check), `--format=json` lists all findings, `--config=<dir>` overrides the bundled configs.

## Reference

Rules the steps above apply.

### Modes

| Mode | Reader | Aim | Checks |
| --- | --- | --- | --- |
| `agent` (default) | Model | Fewest tokens, one literal meaning | Vale spelling and grammar, `write-good`, `Bloat` structure rules, token-density, and the `ai-tells` rules for padding, filler, hedging, pleasantries, puffery, AI vocabulary, figurative and anthropomorphic wording |
| `human` | Person | Reads like a person wrote it | Vale spelling and grammar, `write-good`, `proselint`, every `ai-tells` rule, and `ai-tells-commits` for commit and PR text. No `Bloat` length limits, no density warnings |

`--mode=ai` is a deprecated alias of `agent`. It prints a notice on stderr and reports `agent`. Delete the alias once `grep -rn --include='*.md' -- '--mode=ai' ~/.agents/skills` finds only this line.

### Findings and severity

Only `error` findings block the review (exit 1). Vale style findings are warnings: the tree lists them, JSON reports them as `summary.valeWarnings`, and the result stays `CLEAN`. This holds for every `ai-tells` and `ai-tells-commits` rule, which the packages emit at `error`.

The `--format=json` result has `findings` for `lint`, `prose` (blocking), `warnings`, `links`, `structure`, and `security`, so the tree cap hides nothing.

Vale runs with `--no-global`. Only the bundled `assets/.vale/styles` and the `MarkdownQuality` vocabulary apply, so a Vale setup in your home directory cannot change results. Add accepted terms to `assets/.vale/styles/config/vocabularies/MarkdownQuality/accept.txt`.

Agent mode enables `ai-tells` rules from an allowlist in `assets/modes/agent/.vale.ini`. A package update adds no rule there until the list names it. Vale ignores unknown rule names without a message, so after every package update run:

```bash
bun ~/.agents/skills/markdown-quality/scripts/rule-audit.ts
```

It exits 1 when the allowlist names a rule the package no longer ships, or when the package ships a rule absent from `assets/modes/ai-tells-reviewed.txt`. Add each wanted rule to the allowlist, then run `rule-audit.ts --accept` to record the decision.

For rule lookup, suppressions, and false positives, read [tool-reference](references/tool-reference.md). For pre-commit, CI, and commit-msg hooks, read [ci-integration](references/ci-integration.md).

### Structural invariants (tool-enforced)

- **Code fences (`MD040`):** give every fence a language tag (`bash`, `json`, `text`).
- **Spacing (`MD031`, `MD032`):** blank lines before and after fences and lists.
- **Headings (`MD018`):** one space after `#`. Use at most H4. Never place headings back to back without body text.
- **Symbols:** write arrows as `->` or `→`, not unrendered LaTeX.

### Semantic quality

- State the exact rule, not a vague prohibition.
- End technical docs with runnable check commands.
- Put multi-variable comparisons in tables.
- Keep instructions neutral. Avoid presumptuous wording.
- Verify relative paths (`./doc.md`) and heading anchors (`#section`). Link README index entries to headings, never to line numbers or ranges:

  ```markdown
  - [API contracts, services, and repositories](architecture.md#api-contracts-services-and-repositories)
  - [Store conventions](stores.md#store-conventions)
  ```

The structure checker validates heading depth, orphan headings, and unrendered LaTeX. The link checker validates README index targets.

### Rationalizations

| Excuse | Reality |
| --- | --- |
| "It's just documentation, formatting doesn't matter" | Malformed tables, unclosed fences, and broken anchors break LLM chunking and IDE previews. |
| "I'll eyeball spacing and headings" | The CLI catches trailing spaces, orphan headings, and list indentation that eyes miss. |
| "The review takes too long" | `scripts/fix.ts` runs in under 0.2 s and repairs most formatting errors. |
| "I'll run the script in a Python cell or notebook" | The `.ts` scripts are Bun CLIs. Run them with `bun`. |

---
name: git-commit
description: >
  Use when generating, drafting, or writing a git commit message. Covers Conventional
  Commits with or without emoji/unicode symbols, adaptive body, or when asked for
  an emoji commit, a plain conventional commit, or just "write a commit".
---

Draft concise Conventional Commit messages for each proposed change group.

## Repo Attribution Check (do first)

Before drafting, check the repo's own instructions (AGENTS.md, CLAUDE.md, CONTRIBUTING.md) for a mandated commit trailer.

- Repo specifies one (e.g. `Co-Authored-By: Claude <noreply@anthropic.com>`) → include it verbatim as the last line, every time, regardless of Style or Depth.
- Repo specifies nothing → omit AI attribution trailers.


## Change Scope and Commit Groups

Inspect the complete working tree before proposing commit messages, even when the index is empty. Run `git status --short`, `git diff --cached`, and `git diff`. Review files Git does not track when needed. Include staged, unstaged, and mixed changes.

Group related changes by intent, proposing one commit group and message for each coherent unit and listing its files or changes. When diffs leave intent unclear, keep changes separate and ask whether the user wants to include them, since an empty staging area does not block this workflow.

Do not stage or commit. If the user later stages a group, check its message against that staged diff.

Do not infer a message from `base...HEAD` or session memory. Describe final behavior, not branch-internal churn.

## Message Style

Follow explicit user style instructions first. Otherwise, inspect recent repository commit subjects and follow their consistent plain or emoji style. When recent commits use both styles or fail to establish a pattern, ask the user to choose before drafting.

After choosing a style, read only its reference: [emoji](references/emoji-style.md) or [plain](references/plain-style.md).

Keep subjects imperative, under 50 characters when practical, and never over 72. The scope is optional.

Choose body depth independently. Omit it for atomic changes. Use one or two rationale sentences or two to four bullets for distinct changes. Include a body for breaking changes, security fixes, migrations, and reverts. Split groups that need five or more bullets.

## Boundary

Present each proposed message in its own Markdown code block.

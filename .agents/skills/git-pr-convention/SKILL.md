---
name: git-pr-convention
description: Use when drafting, revising, or reviewing a pull request title or description from a diff, branch, issue, or existing PR; when asked for a PR body, PR summary, or PR update. Do not use for commit-message-only requests.
---

# Git PR Convention

Draft accurate, repo-aware pull request titles and descriptions. This skill is PR-only; use `caveman-commit` for commit-message-only requests.

## Rules

1. **Local rules win.** Read repository instructions, PR templates, and documented conventions before applying these defaults.
2. **Ground every claim.** Inspect the relevant diff, commits, issue/spec, and existing PR body when available. Never invent issue IDs, test results, commit SHAs, URLs, reviewers, motivations, or speculative reviewer concerns.
3. **Separate why from what.** Put motivation in `## Summary`; put implementation details in `## What's included` or concise bullets beneath the summary.
4. **Keep the shape proportional.** Single-piece changes do not need a subsystem breakdown. Use numbered subsections only for independently reviewable pieces.
5. **Use real links only.** A source link needs a known repository remote, path, and commit SHA. Do not use branch names as permanent permalinks or emit placeholder URLs as if they were real.
6. **Preserve existing signal.** When revising an existing PR, read its current body first. Preserve meaningful motivation, screenshots/images, checklists, reviewer notes, and links unless the user explicitly asks to remove them.
7. **Report testing truthfully.** Include commands actually run and their outcomes. Do not turn planned or unrun checks into passing results.
8. **Avoid local leakage.** Use repository-relative paths. Do not include absolute machine paths, credentials, private URLs, or confidential names.
9. **No side effects by default.** Drafting returns text only. Run `gh` or another PR API only when the user explicitly asks to create or update a PR, and inspect the current state before changing it.

## Fallback format

Use the repository's template when one exists. Otherwise:

- Title: concise, imperative, and consistent with the repository's commit convention; default to `type(scope): summary` without a trailing period when no convention is known.
- `## Summary`: one to three sentences explaining why and the net change.
- `## What's included`: only for multiple logical pieces; use numbered theme sections and file/function bullets.
- `## Testing`: actual verification commands and results when useful.
- `## Notes for reviewers`: only for deliberate omissions or pre-existing issues likely to be mistaken for oversights; every note must be grounded in the diff, spec, repository state, or missing evidence.

## Output contract

For drafting, return the title and body in a Markdown code block and state missing evidence briefly. Do not stage, commit, push, create, or update anything. For an explicitly requested PR mutation, summarize the exact target and preserve unrelated existing content before acting.

## Common mistakes

- Generic PR headings overriding a repository template.
- Calling an unrun test "passing".
- Deleting an existing screenshot or reviewer note while shortening a body.
- Fabricating an issue link or SHA permalink.
- Running `git commit`, `git push`, `gh pr create`, or `gh pr edit` during a drafting request.

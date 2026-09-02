# git-pr

Repo-aware pull request titles and descriptions. This skill focuses strictly on pull requests.
## What it does

Turns a real diff, issue/spec, and repository convention into a concise PR title and body. It explains motivation before implementation details and keeps testing claims tied to commands actually run.

Repository-local instructions and PR templates override this global fallback.

## Use it for

- Drafting a PR title and description from the current changes.
- Revising an existing PR body without losing screenshots, motivation, checklists, or reviewer notes.
- Preparing a multi-part PR description with independently reviewable sections.
- Checking whether a PR description contains unsupported claims or fake links.

Use `caveman-commit` for commit-message-only requests.

## Safety boundary

Drafting produces text only. It does not stage, commit, push, create a PR, or edit an existing PR unless the user explicitly requests that action. When an API or CLI mutation is requested, inspect the existing PR state first and preserve unrelated content.

Never invent issue numbers, test results, commit SHAs, repository links, reviewers, or motivations. Use repository-relative paths instead of absolute local paths.

## Default fallback format

```markdown
Title: type(scope): imperative summary

## Summary
Why the change exists and what it changes.

## What's included
Only for multiple logical pieces; use numbered theme sections.

## Testing
Actual commands run and their results.

## Notes for reviewers
Only deliberate omissions or pre-existing issues likely to look accidental.
```

A repository PR template takes precedence over this format. Single-piece PRs omit `## What's included`.

## Examples

### Single change

```markdown
fix(orders): retry transient API failures

## Summary
Transient API failures could fail an otherwise recoverable orders task. Add bounded retry handling and cover the behavior with tests.

## Testing
- `pytest tests/test_orders.py` — passed
```

### Existing PR edit

Shorten redundant prose, but preserve the existing motivation, screenshots, test checklist, reviewer notes, and useful links unless the user asks to remove them.

## See also

- [`SKILL.md`](./SKILL.md) — agent-facing rules.
- [`caveman-commit`](../caveman-commit/) — commit-message generation.

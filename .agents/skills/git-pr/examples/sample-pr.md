# Sample PR formats

Default fallback format when the repository has no PR template:

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

## Single change

```markdown
fix(orders): retry transient API failures

## Summary
Transient API failures could fail an otherwise recoverable orders task. Add bounded retry handling and cover the behavior with tests.

## Testing
- `pytest tests/test_orders.py` (passed)
```

## Existing PR edit

Shorten redundant prose, but preserve the existing motivation, screenshots, test checklist, reviewer notes, and useful links unless the user asks to remove them.

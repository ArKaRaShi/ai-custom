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
Ran `pytest tests/test_orders.py` (3 passed)

**Test cases:**
- `added`: `test_retry_on_transient_503` — verifies automatic backoff on server error
- `added`: `test_fail_fast_on_400` — confirms immediate rejection without retrying
```

## Multi-piece change with test suite refactoring

```markdown
feat(auth): add session revocation and modernize auth tests

## Summary
Adds server-side session revocation endpoint and migrates auth test suites to modern test runner conventions.

## What's included
- **Revocation API**: Adds `DELETE /api/v1/sessions/:id` endpoint.
- **Token invalidation**: Invalidates refresh tokens on revocation.

## Testing
Ran `npm test -- test/auth/` (24 passed)

**Test cases (compact delta):**
- `added`: `test_revoke_active_session` — verifies 204 status and token invalidation
- `updated`: `test_expired_token_rejected` — reflects updated 401 error envelope format

**Test suite refactoring:**
- Migrated 22 legacy test cases to modern runner conventions with shared fixtures.
- Preserved all assertion invariants with zero behavioral regressions.

## Existing PR edit

Shorten redundant prose, but preserve the existing motivation, screenshots, test checklist, reviewer notes, and useful links unless the user asks to remove them.

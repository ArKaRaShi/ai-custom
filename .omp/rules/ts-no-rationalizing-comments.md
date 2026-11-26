---
description: Fix deficiencies instead of rationalizing them with comments
globs:
  - "**/*.ts"
  - "**/*.tsx"
condition:
  - '(?m)^[ \t]*(?://|/\*|\*)[ \t]*\S'
scope:
  - "tool:edit(*.ts)"
  - "tool:edit(*.tsx)"
  - "tool:write(*.ts)"
  - "tool:write(*.tsx)"
interruptMode: never
repeatMode: once
---

## Default

Default to no comments. Let names, types, contracts, and structure
express intent.

Remove comments that merely restate what the code says.

A comment explaining special handling is a signal to inspect that
handling, not an invitation to justify it.

This is a guideline, not a gate: the trigger matches any comment, so keep
the kinds listed under "Knowledge not visible in the code".

## Fix the cause, not the wording

When a comment explains why code needs special handling, investigate why
that handling exists.

A plausible explanation does not justify:

- Workarounds and symptom-level fixes.
- Arbitrary delays and manual synchronization.
- Duplicated or derived mutable state.
- Defensive checks caused by weak internal contracts.
- Fallbacks that conceal invalid or missing data.
- Boundary violations and needless indirection.
- Swallowed errors and bypassed constraints.

Fix avoidable deficiencies at their source. Removing the comment does not
fix the defect.

## Knowledge not visible in the code

Preserve comments that communicate:

- Business intent and domain constraints.
- Verified external system limitations.
- Non-obvious decisions and justified trade-offs.
- Required API documentation and tooling directives.
- References to standards or known issues.

Keep an unavoidable workaround only when you verified the constraint.

If the root cause is outside the current scope, surface it explicitly
rather than silently accepting it.

Do not invent abstractions, alter intended behavior, or widen the task
solely to delete a comment.

## Test

- Restates the code? Remove it.
- Justifies an avoidable deficiency? Fix the cause.
- Preserves knowledge unavailable from the code? Keep it.

See `skill://principle-fix-root-causes`.

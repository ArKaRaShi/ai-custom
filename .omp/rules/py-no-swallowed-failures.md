---
description: Preserve the distinction between successful results and failures
globs:
  - "**/*.py"
condition:
  - '\bexcept\s*(?::|Exception\b|BaseException\b)'
  - '\bcontextlib\.suppress\s*\('
scope:
  - "tool:edit(*.py)"
  - "tool:write(*.py)"
interruptMode: never
repeatMode: once
---

## Default

Success, absence, and failure are different outcomes. Keep them apart
unless the domain defines them as one.

This is a guideline, not a gate. A matched handler is a candidate for
inspection, not evidence of a defect.

## Handle failures intentionally

Catch a failure only where you can recover, translate, clean up, report,
or isolate it.

Do not hide failures through:

- Empty or successful return values.
- Broad handling with no recovery policy.
- Logging that leaves the caller seeing success.
- Unbounded retries.
- Silent suppression.

Logging an error is not recovery.

Prefer propagating the failure to the boundary responsible for handling it.

## Allow

- Expected domain-level recovery.
- Exception translation at boundaries.
- Resource cleanup.
- Isolation between independent operations.
- Explicit partial-success contracts.
- Bounded retries for recoverable failures.

## Example

```python
# Avoid
try:
    return client.get_orders()
except Exception:
    return []

# Prefer
return client.get_orders()
```

The caller cannot tell "no orders" from "the request failed".

## Test

Can the caller tell a successful empty result from a failed operation?

If not, check whether the contract intends that loss.

This rule does not require logging, custom exceptions, or result wrappers.

See `skill://principle-fix-root-causes`.

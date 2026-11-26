---
description: Keep missing, empty, and zero distinct
globs:
  - "**/*.py"
condition:
  - '\bor\s+(?:0\b|False\b|\x22\x22|\x27\x27|\[\]|\{\})'
  - '\.get\s*\([^()\n]*,\s*(?:0\b|False\b|\x22\x22|\x27\x27|\[\]|\{\})'
scope:
  - "tool:edit(*.py)"
  - "tool:write(*.py)"
interruptMode: never
repeatMode: once
---

## Default

Missing, invalid, empty, and zero are different states.
Keep them distinct unless the contract says otherwise.

A default must represent intended semantics, not merely
keep the code running.

This is a guideline, not a gate. A default is a candidate
for inspection, not evidence of a defect.

## Preserve the distinction

Before adding a default, determine:

- Why can the value be absent?
- Does the contract permit absence?
- Does the replacement change its meaning?
- Does a consumer need to tell the two apart?

If absence violates the contract, fix its source.

If absence is legitimate, preserve it until the boundary
responsible for interpreting it.

Do not replace missing or invalid data with valid-looking
values only to fit a type or avoid an error.

## Allow

- Explicit business and configuration defaults.
- Defaults defined by a documented optional-field contract.
- Presentation-only placeholders.
- Empty collections used for accumulation.
- Aggregation where zero is the additive identity:
  `counters.get(key, 0) + 1`.

## Example

```python
# Avoid: unknown price becomes zero
price = record.get("price") or 0

# Prefer: preserve absence
price = record.get("price")
```

Handle absence according to the contract.

## Test

Does the default express intended behavior, or merely
prevent an error?

Would a consumer mistake the replacement for real data?

Do not introduce unnecessary validation, wrappers, or
abstractions only to delete a default.

See `skill://principle-model-the-domain`.

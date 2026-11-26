---
description: Name intermediate results when nesting obscures intent
globs:
  - "**/*.py"
astCondition:
  - "$F($G($$$B))"
  - "$F($$$A, $G($$$B))"
  - "$F($$$A, $G($$$B), $$$C)"
  - "$F(await $X)"
scope:
  - "tool:edit(*.py)"
  - "tool:write(*.py)"
interruptMode: never
repeatMode: once
---

## Default

Name intermediate results when nesting obscures execution order, a
processing stage, or a failure point.

Prefer separating asynchronous and side-effectful operations from
expressions that consume their results.

A name should reveal meaning, not merely remove nesting.

This is a guideline, not a gate. A matched expression is a candidate for
inspection, not evidence of a defect.

## Allow

- Simple composition whose intent and order are obvious.
- Test assertions and predicates.
- Mathematical expressions such as `max(0, min(x, 100))`.
- Callbacks and function references.
- Framework expressions that nest by design.

## Example

```python
# Avoid: deeply nested processing stages
save(normalize(validate(parse(payload))))

# Prefer: named intermediate results
parsed = parse(payload)
validated = validate(parsed)
save(normalize(validated))

# Allow: readable composition
label = format_date(parse_iso(value))
assert is_valid(parse(payload))

# Prefer: explicit asynchronous operation
order = await repository.save(data)
return handle_result(order)
```

## Test

Does extracting the result reveal useful information, clarify execution,
or reduce reader load?

If not, keep the expression.

Do not introduce meaningless names, split expressions mechanically, or
rewrite unrelated code.

Preserve evaluation order and intended behavior.

See `skill://principle-minimize-reader-load`.

---
description: Name intermediate results when nesting obscures intent
globs:
  - "**/*.ts"
  - "**/*.tsx"
astCondition:
  - "$F($G($$$B))"
  - "$F($$$A, $G($$$B))"
  - "$F($$$A, $G($$$B), $$$C)"
  - "$F(await $X)"
scope:
  - "tool:edit(*.ts)"
  - "tool:edit(*.tsx)"
  - "tool:write(*.ts)"
  - "tool:write(*.tsx)"
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
- Mathematical expressions such as `Math.max(0, Math.min(x, 100))`.
- Callbacks and function references.
- Framework expressions that nest by design.

## Example

```typescript
// Avoid: deeply nested processing stages
save(normalize(validate(parse(payload))))

// Prefer: named intermediate results
const parsed = parse(payload)
const validated = validate(parsed)
save(normalize(validated))

// Allow: readable composition
const label = formatDate(parseIso(value))
expect(isValid(parse(payload))).toBe(true)

// Prefer: explicit asynchronous operation
const order = await repository.save(data)
return handleResult(order)
```

## Test

Does extracting the result reveal useful information, clarify execution,
or reduce reader load?

If not, keep the expression.

Do not introduce meaningless names, split expressions mechanically, or
rewrite unrelated code.

Preserve evaluation order and intended behavior.

See `skill://principle-minimize-reader-load`.

---
description: Name call results instead of nesting calls in arguments
globs:
  - "**/*.ts"
  - "**/*.tsx"
condition:
  - '(?m)\b(?!(?:repeat|minmax|calc|var|url|rgb|rgba|clamp)\b)[A-Za-z_][A-Za-z0-9_]*\((?:(?!(?:=>|\bfunction\b))[^()])*\b(?!(?:String|Number|Boolean|repeat|minmax|calc|var|url|rgb|rgba|clamp)\b)[A-Za-z_][A-Za-z0-9_]*\('
scope:
  - "tool:edit(*.ts)"
  - "tool:edit(*.tsx)"
  - "tool:write(*.ts)"
  - "tool:write(*.tsx)"
interruptMode: never
---

Never pass the result of a call as an argument of another call (with or without `await`).
Assign the result to a named variable first, one call per line.

Passing a function without calling it (arrow function, named callback such as `rows.filter(isActive)`)
is allowed. Type conversions as arguments (`String()`, `Number()`, `Boolean()`) are also allowed.

```typescript
// Avoid: the await and the second call hide inside an argument list
return handleWrResult(review.id, await store.createWr(review.id, data, images))
const label = formatDate(parseIso(row.createdAt))

// Prefer: each result is named and the effects read top to bottom
const result = await store.createWr(review.id, data, images)
const created = parseIso(row.createdAt)

return handleWrResult(review.id, result)
const label = formatDate(created)
```

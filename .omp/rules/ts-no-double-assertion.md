---
description: Ban double type assertions (as unknown as, as any as)
globs:
  - "**/*.ts"
  - "**/*.tsx"
condition:
  - "\\bas\\s+(?:unknown|any)\\s+as\\b"
scope:
  - "tool:edit(*.ts)"
  - "tool:edit(*.tsx)"
  - "tool:write(*.ts)"
  - "tool:write(*.tsx)"
interruptMode: always
---

Never use double type assertions like `value as unknown as Target` or
`value as any as Target`.

Double assertions bypass TypeScript's type safety completely. Use type guards,
type narrowing, discriminated unions, or schema validation (such as Zod)
at system boundaries.

```typescript
// Avoid: double casting to force an incompatible type
const user = rawData as unknown as User;
const user = rawData as any as User;

// Prefer: runtime schema validation or type narrowing
const user = UserSchema.parse(rawData);

// Prefer: type guard function
if (isUser(rawData)) {
  const user = rawData;
}
```

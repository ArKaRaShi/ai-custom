---
description: Ban any in TypeScript annotations and assertions
globs:
  - "**/*.ts"
  - "**/*.tsx"
condition:
  - ":\\s*any\\b"
  - "\\bas\\s+any\\b"
scope:
  - "tool:edit(*.ts)"
  - "tool:edit(*.tsx)"
  - "tool:write(*.ts)"
  - "tool:write(*.tsx)"
interruptMode: always
---

Never use `: any` annotations or `as any` assertions in TypeScript code.
They disable the compiler's type checker and mask runtime boundary defects.

## Use instead

- `unknown` for unvalidated external input, parsed JSON, or dynamic payloads.
- Schema parsing (`zod`, `valibot`, `joi`) to validate and type untrusted data at boundaries.
- Generics (`<T>`) when the caller dictates the shape.
- Type narrowing / type guards (`typeof`, `in`, `instanceof`) for runtime discrimination.
- `satisfies` for object literals that must conform to a contract without widening.
- Explicit domain types, interfaces, or Prisma transaction types (`PrismaClient`, `TransactionClient`).

```typescript
// Avoid: disabling type checking
const tx = {} as any;
function handlePayload(data: any): any {
  return data.id;
}

// Prefer: explicit types or narrowing unknown
const tx: TransactionClient = dbTx;

function handlePayload(data: unknown): string | undefined {
  if (data && typeof data === "object" && "id" in data && typeof data.id === "string") {
    return data.id;
  }
}

// Prefer: schema validation at trust boundaries
const user = UserSchema.parse(rawData);
```

When interacting with untyped third-party libraries or legacy mocks where no type exists, use `unknown` or define a minimal local interface instead of `any`.

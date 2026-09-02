---
description: Prefer union types and as const objects over TypeScript enums
globs:
  - "**/*.ts"
  - "**/*.tsx"
condition:
  - "\\b(?:const\\s+)?enum\\s+[A-Za-z0-9_]+\\s*\\{"
scope:
  - "tool:edit(*.ts)"
  - "tool:edit(*.tsx)"
  - "tool:write(*.ts)"
  - "tool:write(*.tsx)"
interruptMode: never
---

Prefer string union types or `as const` object maps over TypeScript `enum`.

TypeScript `enum` constructs emit runtime JavaScript boilerplate, introduce
numeric reverse-mapping gotchas, and don't align with standard JavaScript idioms.

```typescript
// Avoid: TypeScript enum
enum UserRole {
  Admin = "ADMIN",
  User = "USER",
}

// Prefer: string union type (simplest)
type UserRole = "ADMIN" | "USER";

// Prefer: as const object map when runtime value iteration is needed
const UserRole = {
  Admin: "ADMIN",
  User: "USER",
} as const;

type UserRole = (typeof UserRole)[keyof typeof UserRole];
```

If an existing project or third-party library already standardizes on enums,
follow the project convention.

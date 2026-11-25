---
description: Derive a variant union from one const registry, and key it in UPPER_SNAKE when the keys are the ids
globs:
  - "**/*.ts"
  - "**/*.tsx"
condition:
  - '(?:^|\n)[ \t]*(?:export )?const [A-Z][A-Z0-9_]+ = \{\s*[a-z][A-Za-z0-9_]*\s*:[\s\S]*?\}[ \t]*as const;[\s\S]{0,400}?(?:export )?type [A-Za-z0-9_]+ = keyof typeof'
scope:
  - "tool:edit(*.ts)"
  - "tool:write(*.ts)"
interruptMode: never
repeatMode: after-gap
---

A table of variants is the replacement for `enum`: `enum` is not erasable, so type-stripping
runtimes cannot load it. Keep one table and derive the union from it; never restate the
members in a second declaration.

- Keys are the ids (`keyof typeof REGISTRY`): write them UPPER_SNAKE.
- Values are the ids (`(typeof REGISTRY)[keyof typeof REGISTRY]`): keys are labels, so
  follow the file.

```typescript
// Avoid: a hand-written union beside the table, and lowercase ids you must now grep case-insensitively
export const HOOK_CATEGORIES = { advisory: {}, warn: {} } as const;
export type HookCategory = "advisory" | "warn";

// Prefer: one table, keys are the ids, the union derives
export const HOOK_CATEGORIES = { ADVISORY: {}, WARN: {} } as const;
export type HookCategory = keyof typeof HOOK_CATEGORIES;

// Also fine when the ids are the values: uppercase keys stay labels, the union derives from values
export const CURRENCY = { USD: "usd", EUR: "eur" } as const;
export type Currency = (typeof CURRENCY)[keyof typeof CURRENCY];
```

Follow the surrounding file when it already keys the same job another way: a mirrored
third-party shape, generated code, or a data table whose keys are wire names. This is a
default, not a mandate.

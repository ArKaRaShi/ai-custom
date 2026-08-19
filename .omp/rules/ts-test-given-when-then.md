---
description: Enforce given/when/then naming in TypeScript test describe blocks
globs:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "**/*.test.tsx"
  - "**/*.spec.tsx"
condition:
  - "describe\\([\"'](?!given )"
scope:
  - "tool:edit(*.test.ts)"
  - "tool:write(*.test.ts)"
  - "tool:edit(*.spec.ts)"
  - "tool:write(*.spec.ts)"
  - "tool:edit(*.test.tsx)"
  - "tool:write(*.test.tsx)"
  - "tool:edit(*.spec.tsx)"
  - "tool:write(*.spec.tsx)"
interruptMode: never
---

All TypeScript/JavaScript test `describe` blocks MUST use given/when/then naming.
Format: `describe("given <setup>, when <action>, then <expected>")`

If no project standard is specified or the file has no existing convention,
default to given/when/then always.

```ts
// ✅ Correct
describe("given a 0% usage fraction, when render12Bar is called, then bar is all-blank", () => {
  it("renders 12 blank Braille characters", () => {
    expect(render12Bar(0).bar).toBe(`[${"⠀".repeat(12)}]`);
  });
});

describe("given an expired token, when the request is made, then 401 is returned", () => {
  ...
});

// ❌ Wrong
describe("render12Bar tests", () => { ... });
describe("quota-status extension tests", () => { ... });
```

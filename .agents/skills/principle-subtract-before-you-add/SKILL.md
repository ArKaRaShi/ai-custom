---
name: principle-subtract-before-you-add
description: Use when extending, fixing, or refactoring existing behavior.
disable-model-invocation: true
---

# Subtract Before You Add

**Principle:** Before extending an existing system, look for unnecessary complexity that can be safely removed, consolidated, or replaced.

**Why:** Building on obsolete paths, redundant abstractions, and workarounds compounds maintenance costs. A simpler foundation can make a new requirement easier to implement.

## The Pattern

- Inspect relevant existing implementations before introducing new behavior.
- Reuse or extend existing capabilities instead of creating parallel implementations.
- Identify dead code, redundant wrappers, duplicate logic, and obsolete workarounds.
- Remove or consolidate unnecessary complexity when safe and relevant.
- Prefer replacing outdated mechanisms over maintaining competing paths indefinitely.
- Preserve intentional distinctions, public contracts, and existing behavior unless a change is explicitly approved.

## Paired Example

```text
// Avoid: stack a new workaround without understanding the existing one
existing workaround -> additional workaround -> new feature

// Prefer: understand the existing path and simplify only when safe and relevant
understand existing behavior -> simplify when appropriate -> extend
```

Rationale: stacking workarounds creates competing paths whose interactions must be maintained. Simplification is optional when removing a path would change required behavior.

## The Tests

- Can an existing implementation be reused or simplified?
- Am I adding another path that must be maintained?
- Does apparent duplication represent different responsibilities?
- Is the cleanup relevant, safe, and covered by appropriate verification?

**Constraint:** Do not turn a focused change into unrelated refactoring. Subtract only when the benefit is clear and behavior can be preserved.

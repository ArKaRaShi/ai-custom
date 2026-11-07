---
name: principle-laziness-protocol
description: Laziness protocol. Use when refactoring, judging diff size, or considering abstractions, layers, or signal threading.
disable-model-invocation: true
---

# Laziness Protocol

Solve the actual problem with the smallest coherent change.

## Rules

- Delete unnecessary code before adding new layers or abstractions.
- Consolidate repeated decisions into one source of truth; pass the result as a simple flag when needed.
- Minimize the diff while preserving complete behavior and maintainability. Prefer fewer lines over boilerplate added for elegance.

## Example

Compute a shared policy decision once and pass its result to the consumers instead of making each consumer repeat the decision.

## The tests

- Is there an unnecessary layer or duplicated decision to remove?
- Does every changed line contribute to a complete solution?

## Source

Adapted from [pstack](https://github.com/cursor/plugins/tree/main/pstack/skills/principle-laziness-protocol), copyright 2026 Lauren Tan, MIT licensed. See [LICENSE](LICENSE).

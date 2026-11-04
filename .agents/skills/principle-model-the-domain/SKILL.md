---
name: principle-model-the-domain
description: Use when designing data structures, modeling state or transitions, or simplifying repeated conditional logic. For glossary or ADR work use domain-modeling.
disable-model-invocation: true
---

# Model the Domain

**Principle:** represent the problem using data structures and types that express valid states, relationships, and invariants instead of scattering assumptions across conditional logic.

**Why:** poor representations create repeated branching and invalid state combinations. Choosing the right representation simplifies the code that follows.

## The Pattern

- Prefer explicit states or state machines over dependent booleans.
- Use typed models and discriminated unions to represent distinct variants.
- Consider maps, registries, or lookup tables when the same branching logic appears repeatedly.
- Use reducers or explicit transitions when state changes require coordinated rules.
- Choose collections and data structures based on relationships and access patterns.
- Keep invariants close to the data or operations that own them.

## Paired Example

```typescript
// Avoid: independent booleans that permit invalid combinations (such as uploading and completed)
type Upload = {
  isUploading: boolean
  isCompleted: boolean
  hasError: boolean
}

// Prefer: discriminated union representing only valid, mutually exclusive states
type Upload =
  | { status: 'idle' }
  | { status: 'uploading'; progress: number }
  | { status: 'completed'; url: string }
  | { status: 'failed'; error: Error }
```

Rationale: dependent boolean flags permit impossible state combinations, forcing defensive conditional checks across every consumer and causing silent runtime bugs.

## Scope Boundaries

**Avoid forcing an abstraction:** when straightforward conditionals and simple data structures already represent the problem well, keep them. A new abstraction should remove real complexity rather than move code around.

## The Tests

- Can code represent invalid or contradictory states?
- Do separate modules repeat the same state assumptions or conditionals?
- Does the chosen structure simplify operations performed on it?
- Does a new abstraction remove complexity or add indirection?

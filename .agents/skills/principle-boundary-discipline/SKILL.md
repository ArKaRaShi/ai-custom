---
name: principle-boundary-discipline
description: Use when handling untrusted input, validation, errors, persistence, or external integrations.
disable-model-invocation: true
---

# Boundary Discipline

**Principle:** Validate untrusted data, establish contracts, and handle failures where responsibility or trust changes.

**Why:** Scattered validation and defensive checks duplicate logic and obscure assumptions about failure.

## The Pattern

- Validate and normalize untrusted input at entry points and integration boundaries.
- Convert external representations into well-defined internal contracts.
- Rely on established internal guarantees instead of repeatedly checking the same assumptions.
- Enforce domain invariants where the relevant state or operation is controlled.
- Catch errors where they can be recovered from, translated, or given useful context.
- Treat external responses, persisted data, and concurrent state as potentially unreliable when appropriate.
- Keep framework-specific validation and error translation from leaking unnecessarily into core logic.

Input validation and domain invariants are distinct: an integer can be valid input while still exceeding a business limit.

## Paired Example

```text
// Avoid: repeat the boundary's integer check inside trusted processing
function process(value):
    if value is not an integer:
        return invalid input
    return value * 2

// Prefer: establish the contract at entry; process relies on it
function parseInput(raw):
    if raw is not an integer:
        raise invalid input
    return raw

function process(value: integer):
    return value * 2
```

Rationale: repeated checks can obscure which component establishes the contract and produce inconsistent error handling. Domain rules and runtime failures still need checks at their appropriate boundaries.

## The Tests

- Where does untrusted data enter the system?
- Which component establishes and owns the contract?
- Am I repeating validation guaranteed by a trusted boundary?
- Are business invariants and genuine runtime failures still handled?
- Does error handling recover, translate, or add useful context?

**Constraint:** Trust established contracts, not arbitrary assumptions. Never remove checks that protect security, correctness, or invariants.

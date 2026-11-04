---
name: principle-minimize-reader-load
description: Use when writing, reviewing, or refactoring code where data flow, state, control flow, or indirection affects comprehension.
disable-model-invocation: true
---

# Minimize Reader Load

**Principle:** Optimize code for the mental effort required to understand, trace, and safely modify its behavior, rather than for fewer lines or more abstractions.

**Why:** Excessive indirection, scattered logic, and hidden state make readers track implicit dependencies across files.

## The Pattern

- Minimize unnecessary hops between a caller and the behavior it invokes.
- Keep related logic close enough to understand together.
- Prefer explicit data flow and local state over hidden mutable state.
- Preserve abstractions that enforce useful boundaries or hide genuine complexity.
- Favor clear names and straightforward control flow over clever or compressed code.
- Make state ownership, side effects, and important dependencies discoverable.

Locality is a trade-off. A security boundary, shared policy, or complex algorithm may justify an extra hop.

## Paired Example

```text
// Avoid: a pass-through wrapper adds a hop with no policy or boundary
function calculateTotal(cart):
    return calculateTotalHelper(cart)

function calculateTotalHelper(cart):
    return sum(cart.itemPrices)

// Prefer: put the calculation at its entry point
function calculateTotal(cart):
    return sum(cart.itemPrices)
```

Rationale: a wrapper with no independent purpose forces readers to navigate another function to find the calculation.

## The Tests

- How many files or layers must a reader traverse to understand this behavior?
- What state must the reader mentally track?
- Does each abstraction reduce more complexity than it introduces?
- Could the behavior be more direct without losing an important boundary?

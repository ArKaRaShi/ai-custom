---
name: principle-sequence-verifiable-units
description: Use for multi-step work such as sweeps, migrations, and runs of similar edits, and when stacking commits or PRs.
disable-model-invocation: true
---

# Sequence Work Into Verifiable Units

**Principle:** Order work as small units that each end in a checkable state. Do not start the next unit until the current check passes.

**Why:** A break caught at the unit that caused it is cheap to localize. A break caught after a batch is buried, and later work already sits on a broken base. A delivery order that a reviewer can replay turns "trust me" into "watch it go red, then green."

## The Pattern

**Execution**

- Bracket each unit: known-good state, one change, run the check, then proceed.
- Rebase onto clean trunk first, so each check measures against the real baseline.
- When a script does the edits, the per-unit check is nearly free. Run it anyway.

**Delivery**

- Stack commits and PRs in the order that proves the work.
- Canonical order: failing test first, then the fix on top.
- Other orders: a subtraction before the reshape, a baseline capture before the change, the scaffold before the feature.
- Each commit lands on its own, and the sequence reads as an argument.

## Paired Example

```text
// Avoid: one batch, one check at the end
rename 40 call sites -> run tests -> 12 failures, cause unknown

// Prefer: bracketed units
rename call site 1 -> run check -> green
rename call site 2 -> run check -> green
... call site 17 -> red -> the cause is the one edit just made
```

Rationale: the red check points at one edit. The batch gives 12 failures and no starting point.

## The Tests

- Does each unit end in a check I ran, not one I plan to run?
- Did I start from a known-good baseline?
- Can each commit land on its own and pass?
- Does the commit order show the problem before the fix?

**Constraint:** Scale unit size to risk. A one-file change is one unit. Pairs with `principle-prove-it-works`, which keeps each check real.

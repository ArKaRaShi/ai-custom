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

## The Tests

- Does each unit end in a check I ran, not one I plan to run?
- Did I start from a known-good baseline?
- Can each commit land on its own and pass?
- Does the commit order show the problem before the fix?

**Constraint:** Scale unit size to risk. A one-file change is one unit. Pairs with `principle-prove-it-works`, which keeps each check real.

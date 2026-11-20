---
name: principle-exhaust-the-design-space
description: Use for a novel UI interaction, architectural decision, or product design choice with no precedent in the codebase, to compare 2-3 competing prototypes before committing.
disable-model-invocation: true
---

# Exhaust the Design Space

**Principle:** With no precedent, build two or three competing prototypes and compare them side by side before committing to one.

**Why:** The first workable idea is rarely the best one, and a choice that depends on feel, not logic, cannot be settled by argument. Prototypes are cheap, and a wrong production design is not.

## The Pattern

- Confirm no precedent exists in the codebase. If one exists, follow it.
- Pick two or three options that differ in a real way, not in cosmetics.
- Build each as a throwaway prototype, small enough to run in minutes.
- Compare them side by side against the same scenario.
- Commit to one, and record why the others lost.
- Discard the prototypes. Build the chosen design properly.

## The Tests

- Is there truly no precedent in the codebase?
- Do the options differ in structure or interaction, not only in styling?
- Were all options judged on the same scenario?
- Is the reason the losers lost written down?

**Constraint:** Use this only for decisions that are hard to reverse or depend on feel. For a fact you can observe by running something, run it instead of building competing designs.

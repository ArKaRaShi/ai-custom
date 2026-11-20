---
name: principle-outcome-oriented-execution
description: Use during planned rewrites and migrations with explicit phase boundaries, to converge on the target architecture instead of preserving throwaway compatibility states.
disable-model-invocation: true
---

# Outcome-Oriented Execution

**Principle:** Optimize for the intended, verifiable end state, not for keeping every intermediate state smooth.

**Why:** Keeping each intermediate step fully stable often creates temporary compatibility code that becomes long-lived debt. Converge on the target and prove correctness at explicit verification boundaries.

## The Pattern

- Prioritize end-state integrity over transitional stability.
- Accept intermediate breakage when it is planned, scoped, and reversible.
- Declare in the plan where temporary breakage is acceptable.
- Keep high-signal checks on the areas you are actively touching.
- Require full static and runtime verification when the plan completes.

## The Tests

- Is the target state written down and verifiable?
- Is each point of allowed breakage declared, scoped, and reversible?
- Does any compatibility code exist only to keep a middle state green?
- Is full verification scheduled at the end of the plan?

**Constraint:** Applies only to planned rewrites and migrations with explicit phase boundaries. For ordinary changes, keep the build green at every commit. Never leave breakage undeclared.

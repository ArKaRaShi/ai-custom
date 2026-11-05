---
name: principle-attack-the-premise
description: Use when two or more fixes that share one premise have failed the same check. Test the premise before writing another fix.
disable-model-invocation: true
---

# Attack the Premise

**Principle:** When two or more fixes that share one premise fail the same check, suspect the premise, not the fixes.

**Why:** Each failed fix is evidence against the belief it assumed. A third fix on the same premise spends effort where the evidence says the cause is not.

## The Pattern

- Write the premise down: the one sentence every failed fix assumed.
- Test the premise before the next fix. Find an observation that would come out differently if the premise were false, and make it. Look at how the failures are distributed, not only how large they are. Make the check rerunnable.
- If the evidence contradicts the premise, the cause is elsewhere. Look for what the failures have in common that the premise did not predict.
- If the evidence confirms the premise, ask the next "why" per `skill://principle-fix-root-causes`. The earlier fixes may have treated a consequence.
- Remove the condition instead of compensating for it. If one part always lands on the losing side, change what puts it there.

Stop: do not start the next fix until the premise is written down and tested.

## The Tests

- Can I state the premise in one sentence?
- What observation would differ if it were false, and did I make it?

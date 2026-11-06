---
name: principle-prove-it-works
description: Use when choosing verification or before declaring a code change complete.
disable-model-invocation: true
---

# Prove It Works

**Principle:** Verify that intended behavior works before declaring a change complete. Support correctness claims with relevant evidence.

**Why:** Code that compiles or passes tests may still fail the real use case. Match verification to the behavior and risks of the change.

## The Pattern

- Identify observable success criteria from the requirement.
- Choose verification at the appropriate level: unit, integration, component, end-to-end, or direct execution.
- Test behavior and relevant edge cases rather than only implementation details.
- Verify important boundaries, failure paths, and state transitions where relevant.
- Run applicable static checks, tests, and builds.
- Prefer the smallest reliable verification that demonstrates the required behavior.
- Distinguish verified results from assumptions and untested behavior.
- Report verification limitations explicitly.
- Check the real artifact, not a proxy: read the actual value, run the feature, check process liveness directly. Do not infer from file times, cached output, self-reports, or "it compiles."
- When a check fails, suspect the observation method before suspecting the system.
- Script the check when you can: a deterministic script that reruns the same comparison beats a one-time look. Keep its output as an artifact a reviewer can rerun.

## Paired Example

```text
// Avoid: infer the feature works from compilation alone
implementation finished -> code compiles -> claim feature works

// Prefer: match evidence to the claim
identify requirement -> exercise relevant behavior -> observe expected result
-> run applicable regression checks -> disclose remaining limitations
```

Rationale: compilation alone cannot establish that the real use case behaves as required. Report only checks actually performed and results actually observed.

## The Tests

- What observable evidence demonstrates the requirement is satisfied?
- Did verification exercise changed behavior or merely its mocks?
- Have relevant failure paths and edge cases been considered?
- Could existing behavior have regressed?
- Am I claiming anything I did not actually verify?
- Did I read the real value, or a proxy for it?

**Constraint:** Verification should be proportional to risk. Avoid elaborate test infrastructure for trivial changes, but never claim unperformed verification as successful.

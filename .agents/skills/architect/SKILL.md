---
name: architect
description: Architecting non-trivial changes with competing design sketches before implementation. Use when asked to architect a change or compare architectural shapes before coding.
---

# Architect

Produce and implement a grounded architecture chosen from distinct design candidates.

## Start

Before starting, open a todo list with one entry per phase:

1. Ground
2. Sketch
3. Agree
4. Implement
5. Scrap

For candidate and cross-judge models, use the defaults in `arena`. Use the `scout` agent for delegated `how` and `why` research when the runtime allows it.

## Steps

1. Ground the change using `how`; for ownership or layering changes also use `why`. Skip grounding only for genuinely greenfield work. Capture touched boundaries, existing contracts and constraints. Exit: the design task includes evidence-backed constraints or records why grounding is unnecessary.
2. Run `arena` on the grounded task. Ask each runner to use [runner guidance](references/runner.md), produce a caller-usage sketch, types, interfaces, module map and rationale. Require two structurally distinct candidate shapes, not variants of one shape. Screen each using [design red flags](references/red-flags.md). Compare interface depth, invariants and tradeoffs; synthesize one coherent shape. Exit: the chosen design and rejected alternatives are documented using [rationale](references/rationale.md).
3. If the user requested a checkpoint, present the synthesized design and wait for approval. Otherwise proceed. If the user disputes the shape, re-ground and repeat the design comparison before more implementation. Exit: required approval is received or no checkpoint was requested.
4. Implement the selected design and surface material deviations rather than silently bypassing its contract. Verify the changed behavior, migrate callers and remove obsolete paths. Commit only when explicitly requested. Exit: the implementation and verification satisfy the agreed task.
5. If repeated workarounds, escape hatches or unrelated edge cases reveal a flawed shape, re-ground the implemented work, redesign from the new constraints and repeat step 2. Exit: recurring architectural friction has a corrected design or is reported as a blocker.

## Reference

Adapted from [pstack architect](https://github.com/cursor/plugins/tree/main/pstack/skills/architect), [MIT license](../engineer-principles/LICENSE-pstack.md). Follow the current OMP task and model policies; never assume a Cursor runner configuration.

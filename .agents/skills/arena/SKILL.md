---
name: arena
description: Comparing independent candidate solutions and synthesizing the strongest result. Use for arena requests or when a caller requires competing designs.
---

# Arena

Produce one verified result from independent candidate solutions.

## Start

Before launching anything, open a todo list with one entry per phase:

1. Frame
2. Fan out
3. Cross-judge
4. Pick
5. Graft
6. Verify

## Steps

1. Define the shared task, expected artifact and a rubric of 3–6 observable criteria. Read `cfg://modelRoles`, resolve `arena-candidate-1` and `arena-candidate-2`, and pass their exact model IDs to `task`. If a role is missing, its model is unavailable, or the runtime disallows it, report the blocker; do not silently substitute. Give each runner an isolated output location. Exit: each runner has the same task and grounding, a distinct location and an allowed model.
2. Spawn the runners together in one `task` call. Supply each the shared task, grounding, output location and request for a short rationale with alternatives rejected. Wait for candidates to finish; record failures. If fewer than two usable candidates remain, obtain another or report the blocker rather than treating one as a comparison. Exit: at least two independently produced candidates are available.
3. Read each candidate completely. After candidates finish, resolve `arena-judge` from the active OMP `modelRoles` and request an independent read-only cross-judgment against the rubric using that exact model ID, if the active runtime permits it. If the role is missing or the model is unavailable or disallowed, record that the judge was skipped rather than substituting another model. Score each criterion yourself and compare the review. Exit: a base candidate is chosen with evidence against the rubric.
4. Incorporate useful ideas from other candidates without combining incompatible designs. Record the source and reason for each graft, rejected alternatives, any dropouts and reviewer verdict. If candidates diverge because the task was underspecified, reframe and repeat instead of averaging. Exit: one coherent artifact and synthesis note exist.
5. Exercise the synthesized artifact against the original task. Address verified failures and report the actual checks. Exit: verification passes or the specific blocker is recorded.

## Reference

Adapted from [pstack arena](https://github.com/cursor/plugins/tree/main/pstack/skills/arena), [MIT license](../engineer-principles/LICENSE-pstack.md). OMP's `task` tool controls available agents and model IDs; do not use Cursor-specific model names or fallback rules.

---
name: interrogate
description: Adversarial interrogation of a change or design. Use when asked to interrogate, challenge, stress-test, or find blind spots in code or a plan.
disable-model-invocation: true
---

# Interrogate

Produce independent adversarial reviews with reproducible evidence; report findings without fixing them.

## Steps

1. Frame the review. Use the user's named scope; otherwise review the branch diff from its merge base with the base branch through the working tree, including relevant uncommitted changes. Restate the intended behavior from the request, commits, and PR description when available. Ask only if the intent cannot be established from those sources. Exit: scope and intent are explicit.
2. Prepare independent adversaries using the isolation and fan-out approach in the `arena` skill. Give each reviewer a separate worktree or isolated copy containing the same scoped state, including relevant uncommitted and untracked files; never overwrite the user's work. Use at least two independent reviewers when the task tool and governing delegation rules permit; launch them together. Choose only models permitted by the current OMP harness, without assuming Cursor model names. Each receives the same scope and intent, its own location, and the brief below, without seeing other reviews. Exit: reviewers have independent equivalent inputs, or unavailable seats and reasons are recorded.
3. Give each adversary this brief: “Break this change. Prove each finding by running the real code, a failing test, a reproduction script, or a command showing the wrong behavior. For a design or plan, run a prototype or probe the existing tree. Keep reproduction artifacts in your own location. For each finding report its title, exact command, actual output, and output required by the intent. Omit findings not exercised, including style, naming, structure, and risks requiring a future change. No findings is a valid result.” Respect the user's and harness's restrictions on executing commands, modifying files, and external side effects. Exit: every available reviewer has returned or its failure is recorded.
4. Independently rerun each reported command against the same scoped state when execution is authorized and safe. Keep a finding only if the output reproduces the failure and the failure violates the intent; merge findings with the same root cause and retain every reviewer attribution. Drop failures that cannot be reproduced or do not violate the intent, recording the reason. When execution is prohibited or impossible, do not call findings verified; record the limitation and unverified reports separately. Do not select a winning reviewer or graft fixes as in arena. Exit: every report is classified and no fix is applied.
5. Report the intent; each verified finding with command, observed output, expected behavior, impact, and reviewers; and each reviewer's dropped count and reasons. Say “no verified findings” if none survive. Include failed reviewer seats and verification limitations when applicable. Exit: the evidence and any limits are visible.

## Source

Adapted from [pstack interrogate](https://github.com/cursor/plugins/tree/main/pstack/skills/interrogate) and [arena](https://github.com/cursor/plugins/tree/main/pstack/skills/arena), copyright 2026 Lauren Tan, MIT licensed. See [LICENSE](LICENSE).

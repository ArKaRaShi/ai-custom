---
name: task-followup
description: Use when the user reports a bug, regression, tweak, or small addition to work that was already completed.
---

# Task Follow-up

Use for small changes to completed work. Find the earlier context and choose the relevant subskill. Before editing, state the proposed change and wait for approval.

## Workflow

1. Recover the original task’s goal, agreed behavior, and relevant code context. Inspect available plans, code, and history before asking the user for missing details.
2. Route internally as **bug/regression**, **enhancement/add-on**, or **other small change**. Call it a bug when agreed or existing behavior stopped working. Call it an enhancement when the user asks for behavior not already agreed. Mention the classification only when it affects the discussion. Ask one short question if intent is unclear.
3. Use the matching subskill below. If the request exceeds a bounded follow-up, return to normal planning.
4. Explain the cause or proposed change, its scope, and how you will check it. Wait for explicit approval to edit.
5. Make the smallest complete change and verify the affected behavior. Report the result and any unverified risk.

## Required subskills

**Bug/regression:**

- **REQUIRE SUBSKILL:** `systematic-debugging` before proposing a fix. If unavailable, reproduce and investigate with available tools. State the limitation.
- **REQUIRE SUBSKILL:** `test-driven-development` before fixing the bug. If unavailable, write and run the smallest failing regression check first. State the limitation.

**Enhancement/add-on:**

- **REQUIRE SUBSKILL:** `brainstorming` before proposing a behavior change. If unavailable, present a short design and wait for approval.
- **REQUIRE SUBSKILL:** `test-driven-development` before changing behavior. If unavailable, define and run a failing behavior check first. State the limitation.

For other small changes, do not force the bug or enhancement route. Use a task-specific skill when its trigger applies. Otherwise follow the workflow above.

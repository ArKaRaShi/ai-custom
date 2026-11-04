---
name: engineering-principles
description: Use before designing, writing, refactoring, reviewing, or verifying code. Routes to the principle skills that apply to the task.
disable-model-invocation: true
---

# Engineering principles

Apply these principles to the task. Each row names a trigger. Read the skill in full with `read skill://<name>` when its trigger matches. More than one can apply.

## Index

| Skill | Use when |
| --- | --- |
| `principle-responsibility-boundaries` | assigning ownership, separating concerns, choosing dependencies, or deciding where behavior belongs |
| `principle-model-the-domain` | designing data structures, modeling state or transitions, or simplifying repeated conditional logic |
| `principle-boundary-discipline` | handling untrusted input, validation, errors, persistence, or external integrations |
| `principle-minimize-reader-load` | writing, reviewing, or refactoring code where data flow, state, control flow, or indirection affects comprehension |
| `principle-subtract-before-you-add` | extending, fixing, or refactoring existing behavior |
| `principle-prove-it-works` | choosing verification, or before declaring a code change complete |

## Steps

1. Name the task type: new feature, change to existing code, bug fix, review, or verification.
2. Read every skill whose trigger fits that type, before the first edit.
3. In your first reply, name each principle you read and the choice it changed. If none applies, write `no principle applies` and the reason.

A task that changes existing code always matches `principle-subtract-before-you-add`. A task that adds a feature or a data shape always matches `principle-model-the-domain` and `principle-responsibility-boundaries`.

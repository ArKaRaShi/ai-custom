---
name: ark-mode
description: Playbook router. Use when starting a non-trivial bug fix, feature, refactor, review, or read-only investigation, to pick its playbook and run the steps from a task list.
---

# Ark mode

Router. Picks one playbook for the task and runs its steps in order.

## Steps

1. State the task type: bug fix, feature, refactor, review, or investigation. Exit: you named one of the five types.
2. Read `playbooks/<type>.md` in this skill directory. Exit: you read the playbook in full this session.
3. Copy its steps verbatim into the task list. Exit: the task list has one item per playbook step, with the playbook's wording unchanged.
4. Run one step at a time. Finish a step's exit check before starting the next. Exit: you met every playbook step's exit check, in order.
5. Read each principle in the table below whose trigger fits the task, in full, before the first edit. Also read every `principle-*` skill that a playbook step cites. Exit: you read each such principle in full before the first edit.
6. In the first reply, state the playbook and each principle read, with the choice each one changed. Cite only principles you read this session. If none applies, write `no principle applies` and the reason. Exit: the first reply states the playbook and either each principle with its changed choice or `no principle applies` with the reason.
7. If no playbook fits, say so and ask one question. Exit: you asked the question and started no step.

## Playbooks

|Type|File|Use when|
|---|---|---|
|bug fix|`playbooks/bug-fix.md`|something breaks, throws, fails, or runs slow|
|feature|`playbooks/feature.md`|new or changed behavior|
|refactor|`playbooks/refactor.md`|same behavior, different structure|
|review|`playbooks/review.md`|judging a plan, diff, branch, or PR|
|investigation|`playbooks/investigation.md`|a read-only question|

## Principles

|Skill|Read when|
|---|---|
|`principle-responsibility-boundaries`|assigning ownership, separating concerns, or choosing dependencies|
|`principle-model-the-domain`|designing data structures, modeling state, or simplifying repeated conditionals|
|`principle-boundary-discipline`|handling untrusted input, validation, errors, persistence, or external integrations|
|`principle-minimize-reader-load`|code where data flow, state, or indirection hurts comprehension|
|`principle-subtract-before-you-add`|extending, fixing, or refactoring existing behavior|
|`principle-prove-it-works`|choosing verification, or before declaring a code change done|
|`principle-fix-root-causes`|debugging a failure or error|
|`principle-attack-the-premise`|two or more fixes sharing one premise failed the same check|
|`principle-test-behavior-not-implementation`|writing, changing, or keeping a test|
|`principle-make-operations-idempotent`|code that runs under retries or restarts, such as Celery tasks, DAGs, and migrations|
|`principle-migrate-callers-then-delete-legacy-apis`|replacing an internal API that has existing callers|

## Always

- A task that changes existing code reads `principle-subtract-before-you-add`.
- A task that adds a feature or data shape reads `principle-model-the-domain` and `principle-responsibility-boundaries`.
- Before declaring a code change done, read `principle-prove-it-works` and report only checks actually run.

---
name: engineer-principles
description: Use before non-trivial coding work (bug fix, feature, refactor, review, measurement) to pick which principle skills to read. The principle-* skills are hidden from the skill list and load only through this index.
---

# Engineer principles

Index of the `principle-*` skills. They are hidden from automatic invocation, so this table is the only way to reach them.

## Steps

1. Match the task against the table below. Exit: you listed every principle whose trigger fits.
2. Add the principles from Always that fit the task type. Exit: the list includes each applicable Always principle.
3. Read each listed principle in full with `skill://<name>`, before the first edit. Exit: you read each one this session.
4. In the first reply, state each principle read and the choice it changed. If none applies, write `no principle applies` and the reason. Exit: the reply cites only principles you read this session.

## Principles

|Skill|Read when|
|---|---|
|`principle-responsibility-boundaries`|assigning ownership, separating concerns, or choosing dependencies|
|`principle-model-the-domain`|designing data structures, modeling state, or simplifying repeated conditionals|
|`principle-boundary-discipline`|handling untrusted input, validation, errors, persistence, or external integrations|
|`principle-minimize-reader-load`|code where data flow, state, or indirection hurts comprehension|
|`principle-subtract-before-you-add`|extending, fixing, or refactoring existing behavior|
|`principle-prove-it-works`|choosing verification, or before declaring a code change done|
|`principle-explain-the-number`|measuring, or trusting, reporting, or acting on a speedup, regression, throughput, latency, or evaluation result|
|`principle-fix-root-causes`|debugging a failure or error|
|`principle-attack-the-premise`|two or more fixes sharing one premise failed the same check|
|`principle-test-behavior-not-implementation`|writing, changing, or keeping a test|
|`principle-make-operations-idempotent`|code that runs under retries or restarts, such as Celery tasks, DAGs, and migrations|
|`principle-migrate-callers-then-delete-legacy-apis`|replacing an internal API that has existing callers|
|`principle-redesign-from-first-principles`|integrating a new requirement into an existing design|
|`principle-experience-first`|product, UX, or feature-scope tradeoffs, or an interface that callers or maintainers consume|
|`principle-exhaust-the-design-space`|a novel UI interaction or architectural decision with no precedent in the codebase|
|`principle-outcome-oriented-execution`|planned rewrites and migrations with explicit phase boundaries|
|`principle-foundational-thinking`|before writing logic: choosing core types and data structures, sequencing scaffold-vs-feature work, or deciding what concurrent actors share|
|`principle-sequence-verifiable-units`|multi-step work such as sweeps, migrations, and runs of similar edits, or stacking commits and PRs|
|`benchmark-checklist`|running a benchmark, or reporting a measured speedup or regression|

## Always

- A task that changes existing code reads `principle-subtract-before-you-add`.
- A task that adds a feature or data shape reads `principle-model-the-domain` and `principle-responsibility-boundaries`.
- Before declaring a code change done, read `principle-prove-it-works` and report only checks actually run.

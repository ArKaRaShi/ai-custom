# Feature

1. Settle the goal with `skill://grilling` when the request is vague. Exit: a one-paragraph goal and acceptance criteria the user agreed to. Skip when the request is already exact.
2. State the types or state this feature adds and which module defines each behavior, with `skill://principle-model-the-domain` and `skill://principle-responsibility-boundaries`. Exit: each type and each defining module written down.
   When the feature takes input or calls an external system, also read `skill://principle-boundary-discipline`. Exit: guards sit at the boundary and internal code trusts its types.
   When the feature runs in a worker, task, or DAG, also read `skill://principle-make-operations-idempotent`. Exit: a rerun after a crash at any point reaches the same end state.
3. Write the spec with `skill://to-spec` when the work covers more than one step or both FE and BE. Exit: the spec file path. Skip for a one-file change.
4. Build it with `skill://implement`, deleting dead weight first per `skill://principle-subtract-before-you-add`. Exit: the change compiles and you have deleted the old path it replaces.
5. Exercise the real path with `skill://principle-prove-it-works`, and write tests per `skill://principle-test-behavior-not-implementation`. Exit: an observed result for each acceptance criterion, output pasted.
6. Draft the PR text with `skill://git-pr-mr` only when the user asks for a PR.

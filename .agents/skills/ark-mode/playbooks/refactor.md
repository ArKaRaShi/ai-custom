# Refactor

1. Pin current behavior with `skill://principle-test-behavior-not-implementation`. Exit: a passing test or a saved command output, taken before any edit.
2. Choose the target structure with `skill://principle-responsibility-boundaries` and `skill://principle-minimize-reader-load`. Exit: one sentence on what moves and why the result is simpler.
3. Remove dead weight first with `skill://principle-subtract-before-you-add`. Exit: unused code deleted.
4. Migrate every caller, then delete the old API in the same change, per `skill://principle-migrate-callers-then-delete-legacy-apis`. Exit: searching for the old name finds nothing.
5. Re-run the step 1 check with `skill://principle-prove-it-works`. Exit: the same result as before, output pasted. A changed result means behavior changed: stop and report it.

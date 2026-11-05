# Bug fix

1. Reproduce the failure with `skill://diagnosing-bugs`. Exit: a command or request that fails, with its output pasted.
2. Find the first place the system went wrong, with `skill://principle-fix-root-causes`. Exit: the real bad value or line, with file and line. If two fixes have failed the same check, write down their shared premise and test it with `skill://principle-attack-the-premise` before a third fix.
3. Write a failing test with `skill://tdd` and `skill://principle-test-behavior-not-implementation` when a cheap local test path exists. Exit: the test fails for the reason found in step 2. If no cheap path exists, say so and keep the repro from step 1.
4. Fix at that root cause with `skill://principle-subtract-before-you-add`. Exit: the smallest diff; no clamp, retry, or broad `try/except` hiding the bad value.
5. Run the new test and the repro with `skill://principle-prove-it-works`. Exit: both pass, output pasted. State what was not run.

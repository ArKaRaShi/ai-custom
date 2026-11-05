# Review

1. Pick the target: plan, diff, branch, or PR. Exit: the exact range or file.
2. Question intent and whether a simpler approach reaches the same goal, with `skill://scrutinize`. Exit: a one-line verdict on the approach.
3. Trace the real code path, not only the diff. Exit: each claim of the change confirmed or refuted with file and line.
4. For a branch or PR, run `skill://code-review` for standards and spec. Exit: both reports.
5. Check the evidence the author gave against `skill://principle-prove-it-works`. Exit: a list of claims with no run behind them.
6. Report findings by severity, each with its rationale and file and line. Edit only when asked.

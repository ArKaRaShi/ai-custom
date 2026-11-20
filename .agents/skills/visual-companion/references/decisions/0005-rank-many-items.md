# Five or more items of one shape are ranked, not listed

A review page made from `templates/page.html` gave each of 12 findings the same full section, and showed before and after in a `ui-toggle`, which hides one side. A reader could not tell which findings mattered. The skill followed as written produced it: the template said "one section per claim", `figures.md` mapped before/after to `ui-toggle`, and "cut until it hurts" was an idea, not a rule.

`SKILL.md` now carries two conditional rules. They fire only when five or more items share one shape. Rank them, show the few that matter in full and make every other item a one-line `<details>` row. Show before and after side by side. A shorter list stays open, and every other Freestyle choice stays an idea.

Measured with `evals/harness.ts` (haiku, 5 runs per cell): on the findings scenario the old skill passed 1 of 5 runs and the new one 5 of 5; on the three-item scenario, which must stay open, 3 of 5 and 5 of 5. `ui-diff` and a finding row component stay undone until a second use shows the native `<details>` and hand-drawn panels are not enough.

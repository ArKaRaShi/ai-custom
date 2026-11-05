# Investigate

Use when the reader wants one specific fact proved from evidence: where a number comes from, why a run failed, what changed between two commits, which config value takes effect. The output is an evidence trail with sources and no analogy.

Route elsewhere when the question is really about a mechanism ([Understand](understand.md)) or about picking an option ([Decide](decide.md)).

## Order

1. **Answer.** One `vc-answer` card with the value or conclusion, plus the evidence that decides it. Add what would falsify it when that is not obvious.
2. **Evidence.** Add a row per claim with the value and where it comes from — `path:line`, `git show <sha>:<path>`, a command with its output, a log line.
3. **Chain.** When one value derives from another, show the transforms in order, as [trace](recipes/trace.md) does for numbers.
4. **Next action.** What to check in real data, or what to do about the finding.

## Rules

- **Cite it or drop it.** A claim without a source does not appear. Mark anything you concluded rather than read with `[Inference]`, and say what would confirm it.
- **Quote the decisive line.** One short quote is more useful than a summary of the file around it.
- **Keep code, history, and runtime apart.** Code says what runs, history says what changed, runtime output says what happened; do not present one as another.
- **Report what you could not check.** A blocked or missing source counts as a finding; name it instead of working around it.
- **Label illustrative numbers** and keep them away from measured ones.
- **List only the rows that settle the answer**, usually five, not every row you read.

## Recipes

| Question | Recipe |
| --- | --- |
| "Where does this number come from?" | [trace](recipes/trace.md) |

For a non-numeric question, keep the same order with rows of `claim · value · source` instead of transforms, and drop the analogy line that `trace` inherits from Understand.

## Surface and interaction

A findings table published with `push` usually answers it. Add the inspector from [interaction](../interaction.md) when the reader should check each row against its raw source: one panel per piece of evidence, with `data-state` holding the fields, so moving between rows shows what actually differed.

## Check before showing

1. Every row cites a source the reader could open.
2. Inferred claims are marked and kept apart from observations.
3. The answer states the one fact that matters, before the trail.
4. Each fact appears once on the screen.

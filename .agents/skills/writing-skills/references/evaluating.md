# Evaluating a skill

A skill is better when the same tasks pass more often, more consistently, and with less loaded text. Measure that instead of judging by reading.

## Arms

Run each scenario against three arms:

| Arm | The agent gets |
| --- | --- |
| C, control | Only the task and the tool's own help. |
| A, before | A saved copy of the current `SKILL.md` and its references. A new skill has no A. |
| B, after | The new `SKILL.md`. |

Before editing, copy the skill folder to a temporary arm folder. That copy is arm A.

## Scenarios

Write 4 to 6 scenarios from failures you observed in arm C. Each has a task, a throwaway fixture, and a check on the end state that a script can score. Prefer state checks (a file, a Git remote, a command log) over reading the agent's prose. Read the final text only for what state can't show, such as "asked for approval".

Cover each kind of case the skill handles:

| Skill kind | Scenarios that expose a weak skill |
| --- | --- |
| Rules that must hold under pressure | A task where breaking the rule is the shortcut, plus a task where the user pushes for it. |
| A technique | A task the technique solves, a variation, and a case where it does not apply. |
| Reference | A lookup the answer depends on, and a use of the result. |

Match the guidance to the failure you saw in arm C:

| Failure in arm C | Write |
| --- | --- |
| Skips a rule it knows | The rule, with the likely excuses answered. |
| Does the task but formats the output wrongly | A positive recipe that lists the parts of the output, in order. |
| Omits a required element | A required slot in the template the agent fills in. |
| Behavior depends on a condition | A conditional on something the agent can observe. |

If arm C already passes a scenario, the skill doesn't add anything there. Drop the scenario or the guidance.

## Runs

- Use the smallest model you intend the skill for.
- Run each arm 5 times per scenario, because one run can't separate luck from wording.
- Give every run its own fixture, and prove the real home and repositories did not change: list commands in `guard` whose output must match before and after.
- Count the spread too. When five runs end five different ways, the wording does not bind. Tighten the form before adding words.
- Read every failing run. A scorer can miscount echoes and quoted examples.

## The `evals` folder

Each skill keeps its checks in `<skill>/evals/harness.ts`, a script with four commands:

| Command | Prints |
| --- | --- |
| `scenarios` | A JSON list of scenario ids. |
| `fixture <dir> <scenario>` | Nothing. Builds the sandbox in `<dir>`. |
| `prompt <dir> <scenario>` | JSON with `setup` (the sandbox rules), `discover` (how an agent without the skill finds out how the tool works), `skillNote` (extra notes for skill arms), and `task`. |
| `score <dir> <scenario> <final-text-file>` | JSON `{pass, reasons}`, with exit code 1 on failure. |

`scripts/run-evals.ts` handles the rest: arm prompts, repetitions, scoring and the summary table. It runs inside a code-eval cell, because `agent()` exists only there:

```js
const { runEvals } = await import("<skills-root>/writing-skills/scripts/run-evals.ts");
const result = await runEvals({
  skillDir: "<skills-root>/<skill>",
  arms: [{ name: "C" }, { name: "A", docDir: "/tmp/arms/A" }, { name: "B", docDir: "<skills-root>/<skill>" }],
  reps: 5,
  model: "anthropic/claude-haiku-5-5",
  guard: [["git", "-C", "<real-repo>", "status", "--porcelain"]],
  agent: (prompt, o) => agent(prompt, { model: o.model, label: o.label }),
});
```

`result.table` shows passes per scenario and arm, `result.failures` lists failure reasons, and `result.guardChanged` must be false.

## Acceptance rule

Accept B when all hold:

- B passes at least as many runs as A in every scenario.
- B's failures are no more scattered than A's.
- B's `SKILL.md` is no longer than A's, or each added line fixes a failing scenario.
- `guardChanged` is false.

Otherwise find the failing runs, change the wording, and rerun only the scenarios that moved.

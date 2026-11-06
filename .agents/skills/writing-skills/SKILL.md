---
name: writing-skills
description: Writing agent skills. Use when creating, editing, or reviewing a SKILL.md.
disable-model-invocation: true
---

# Writing Skills

Produces a skill folder that follows one frame and passes the validator.

## Steps

1. Choose the kind: a steps skill makes the agent do something, and a rules skill holds knowledge to apply. Exit: the kind has a name.
2. Save a copy of the current skill as arm A (skip for a new skill), then run the task without the skill and record where the agent fails. Exit: a written list of observed failures.
3. Write 4 to 6 scenarios from those failures in `<skill>/evals/harness.ts`, as [evaluating](references/evaluating.md) describes. Exit: each scenario has a state check a script can score.
4. Copy the template for the kind into `<skills-root>/<name>/SKILL.md`. Steps skill: `assets/steps-template.md`. Rules skill: `assets/rules-template.md`. Exit: the file exists and `name` equals the directory.
5. Fill it with the smallest content that fixes the observed failures, following the Reference below. Exit: every line changes behavior the baseline got wrong.
6. Run `bun ~/.agents/skills/writing-skills/scripts/validate.ts --strict <skill-dir>`. Exit: no errors, and each warning fixed or accepted.
7. Run the scenarios for arms C, A and B, 5 runs each, on the smallest model you plan to use. Exit: the new version meets the acceptance rule in [evaluating](references/evaluating.md). Otherwise tighten the wording and rerun.

## Reference

Rules the steps above apply.

### The frame

Every skill is frontmatter, a title, one sentence on what it produces, then one main section.

| Kind | Main section | Ends with |
| --- | --- | --- |
| Steps skill | `## Steps`, numbered, each step ending `Exit: <checkable condition>` | optional `## Reference` for what only some steps need |
| Rules skill | `## Rules`, each a behavior to follow | `## The tests`, questions that check work against the rules |

The validator accepts `## Steps`, `## Rules`, and `## The Pattern` (read as `## Rules`) as the main section, and matches `## The tests` in any letter case.

### Exit conditions

Each step ends on a condition that tells the agent when to stop. Make it checkable and exhaustive.

- "Every failing scenario has a named cause" forces more legwork than "list the failures".
- A vague exit invites the agent to stop early. [Splitting](#splitting) says what to try first.

### Description

The description is a context pointer. It says what the skill is and which cases should load it.

- Lead with the most distinctive word.
- One trigger per distinct branch. Merge synonyms.
- Third person, at most 1024 characters, without XML tags.
- Leave out anything the body already says.

`Syncing local agent config with a git backup. Use when pushing, pulling, retiring a skill, tracking files, or resolving conflicts in ~/.omp or ~/.agents/skills.`

### Invocation

| Choice | Frontmatter | Costs |
| --- | --- | --- |
| Agent fires it (agent-fired) | description with trigger branches | context load, every turn |
| You fire it (user-fired) | `disable-model-invocation: true`, one-line description | you must remember it exists |

Pick "you fire it" when the skill only ever runs by hand. Pick "agent fires it" when the agent, or another skill, must reach it alone.

No skill can invoke a user-fired skill, because it has no description to find. Put reference that two or more skills need in an agent-fired reference skill, or in a plain file outside any skill folder that each of them links to.

### Router skills

When you cannot remember all your user-fired skills, add one user-fired router skill that names them and says when to use each. It only hints: you type the name of the skill it points to. A skill that loads its targets itself, like `engineer-principles`, is an index, not a router.

### Body

- Keep in `SKILL.md` what every path needs. Move what only some paths need into a file, and point to it with the case that needs it: "For script rules, read [scripts](references/scripts.md)."
- Keep a concept's definition, rules, and caveats under one heading.
- State the behavior you want ("write one-line comments"), not the one to avoid. Keep a prohibition only as a hard guardrail, paired with the positive target.
- Use a word the model already knows (tracer bullet, deep module) in place of a sentence that gestures at it. One term per concept.
- Give one default and one escape hatch.
- Exact commands for fragile steps. Guidance for judgment calls.
- Cache only what the agent cannot find by looking: unwritten conventions, reasons, gotchas. Leave anything a config file or `--help` already says.
- Delete sentences the model follows by default. When in doubt, delete.
- Show one concrete example for any rule a reader could misread.

### Splitting

Split a skill only when the split pays for its cost: a new agent-fired skill adds context load, and a new user-fired skill adds cognitive load.

- **By sequence.** Later steps in view pull the agent toward finishing the current one early. Sharpen that step's exit first. If the exit remains fuzzy and you see the rush, move the later steps behind a real boundary: a handoff or a subagent call. An inline call to another skill leaves them in view and hides nothing.
- **By invocation.** Split off an agent-fired skill when a word you really type in prompts should reach it alone, or another skill must reach it. The new description loads every turn, so the separate trigger must justify that cost.

### Files

- Keep `SKILL.md` under 500 lines. Link every other file from it, one level deep. Give a file over 100 lines a `## Contents` list.
- Name files for their content and use forward slashes.
- Add a folder only when it has real content. Skip `README.md`.
- Keep `node_modules`, `.venv`, and `__pycache__` out of the skill.

### Scripts

Add `scripts/` when a step must be deterministic. For code rules, read [scripts](references/scripts.md).

### Evaluating

For arms, scenarios, repetitions, and the acceptance rule, read [evaluating](references/evaluating.md).

### Validator

`scripts/validate.ts` only reads files and exits 1 on any error. Without `--strict`, frame findings are warnings. With `--strict` they are errors. Requires Bun 1.4 or later.

To audit every authored skill, meaning every folder in the ai-custom repo's skills directory, run `bun ~/.agents/skills/writing-skills/scripts/report.ts`. It prints one status per skill (`ok`, `warnings`, `legacy shape`, `errors`) and exits 1 only on `errors`.

### Credits

[provenance](references/provenance.md) lists where these rules come from. Writing a skill doesn't need it.

---
name: writing-skills
description: Writing agent skills. Use when creating, editing, or reviewing a SKILL.md.
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

### Description

The description is a context pointer. It says what the skill is and which cases should load it.

- Lead with the most distinctive word.
- One trigger per distinct branch. Merge synonyms.
- Third person, at most 1024 characters, without XML tags.
- Leave out anything the body already says.

`Test-driven development. Use when building features or fixing bugs test-first.`

### Invocation

| Choice | Frontmatter | Costs |
| --- | --- | --- |
| Agent fires it | description with trigger branches | context load, every turn |
| You fire it | `disable-model-invocation: true`, one-line description | you must remember it exists |

Pick "you fire it" when the skill only ever runs by hand. Pick "agent fires it" when the agent, or another skill, must reach it alone.

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

### Credits

[provenance](references/provenance.md) lists where these rules come from. Writing a skill doesn't need it.

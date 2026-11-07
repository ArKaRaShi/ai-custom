---
name: why
description: Investigating why code or a design decision exists. Use for rationale, tradeoffs, regressions, historical decisions, incident motivations, and unexplained thresholds.
disable-model-invocation: true
---

# Why

Investigate the evidence behind a code or design decision without presenting plausible stories as historical fact. For runtime behavior, use `how`.

## Steps

1. **Anchor the question.** Identify the target files, lines, symbols, current behavior, and the specific rationale being asked about. If ambiguous, state a reasonable interpretation and proceed. Treat any explanation proposed by the user as a hypothesis to check, not a conclusion. Exit: the target and question are concrete, or the missing anchor is stated.
2. **Trace the history.** Use blame for last touches, then follow file history through renames and inspect relevant patches, commit messages, PR bodies and discussion, linked issues, tests, comments, and in-repo decisions. Trace back beyond the most recent change when it may have inherited the behavior. Use OMP tools for repository search and available Git/PR tools for history. Exit: the originating or relevant changes and their evidence are identified, or the trace's limits are recorded.
3. **Search relevant sources.** Read [sources](references/sources.md), map accessible sources to the seven evidence categories, and search those relevant to the question. Follow meaningful leads across categories and record queries, dates, results, nulls, access failures, retention limits, and reasons for unavailable or skipped categories. For a narrow question, work inline; delegate independent broad investigations to the `scout` agent when OMP's delegation rules permit it and scout has the necessary source access. Give each investigator the question, code anchor, bounded source, and evidence-return requirements in the reference. Exit: relevant available evidence is searched and coverage gaps are explicit.
4. **Synthesize.** Apply [confidence and reporting](references/confidence.md): separate direct statements, converging indirect support, inference, speculation, and unknowns. Cite precise sources, show contradictory evidence, check uncertain citations against the original, and do not infer intent from behavior alone. Exit: every material claim is calibrated and the evidence or gap is visible.
5. **Present.** Answer first, then use applicable sections: Code in Question, What We Found, Reasonable Inferences, Competing Hypotheses, What We Don't Know, Sources Consulted, and Confidence Summary. Include a compact coverage line per category, even for skipped or unavailable sources. If the investigation precedes a change, add Preserve / Change / Avoid / Risk constraints grounded in the findings. Exit: the reader can distinguish what is known, inferred, and unsearched.

## Reference

Adapted from Lauren Tan's [pstack why](https://github.com/cursor/plugins/tree/main/pstack/skills/why); see [license](LICENSE-pstack.md).

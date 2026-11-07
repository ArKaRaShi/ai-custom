---
name: how
description: Explaining how code works. Use for runtime walkthroughs, subsystem architecture, onboarding, ownership, placement, or layering questions.
disable-model-invocation: true
---

# How

Produce a code-grounded mental model of a subsystem, sized to the question. For historical motivation rather than mechanics, use `why`.

## Steps

1. **Scope.** Identify the question, relevant entry point, and desired depth. If ambiguous, state a reasonable interpretation and investigate; invite correction only if it affects the answer. Use OMP `find` for unknown behavior, `grep` for known text, `glob` for names, and LSP for symbol navigation when available. Exit: the target and its entry point or a concrete gap are identified.
2. **Trace.** Read the relevant code and follow calls, data, control flow, decisions, and subsystem boundaries. For ownership or placement, inspect existing responsibilities and dependency directions, then distinguish observed ownership from a recommendation. For a small question, investigate inline. For a genuinely broad subsystem, when OMP delegation rules allow it, assign independent slices to read-only scouts in one batch; give each the question and angle and request components, flow, file:line evidence, boundaries, surprises, and open questions. Exit: the relevant path is traced or missing links are identified.
3. **Synthesize.** Reconcile overlapping or contradictory findings against the source. Explain the trigger, steps, data transformations, decisions, and outputs in concrete language; cite relevant files, lines, and symbols. Include a small file map, non-obvious gotchas, and a diagram only when useful. State gaps instead of inventing behavior. Exit: the answer supports a working mental model and every material claim is grounded or marked uncertain.
4. **Present.** Use applicable sections from Overview, Key Concepts, How It Works, Where Things Live, and Gotchas; omit empty sections and avoid annotated-source dumps. Exit: the user's question is answered at the requested depth.

## Reference

Adapted from Lauren Tan's [pstack how](https://github.com/cursor/plugins/tree/main/pstack/skills/how); see [license](LICENSE-pstack.md).

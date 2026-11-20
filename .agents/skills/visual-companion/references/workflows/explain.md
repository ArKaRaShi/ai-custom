# Explain

Use a lesson spec to teach a mechanism or substantiate an answer. For lesson content, use `skill://mentor`; this route renders the resulting lesson rather than inventing its facts.

1. Put the conclusion in `answer`. The remaining sections may follow the question rather than a fixed template.
2. Gather evidence from source code, commands, or runtime output. Cite the path and line or command for each claim; mark inferences and illustrative numbers explicitly.
   Keep supplied values and units in the comparison. For example, compare 3 and 7 requests as counts; do not substitute durations computed from an assumed rate.
3. Write JSON against the generated lesson schema `explain/lesson.schema.json`. The block catalog includes Concept, Playground, Derivation, Quiz, Evidence, Compare, Chart, Diagram and Svg. Use Svg only when another block does not fit.
4. For a calculation, run the real code with the example inputs and put each observed result in the matching derivation step's `expect`. A mismatch prevents publishing. Keep units and source references with their steps.
5. Start the companion after consent, publish with `explain <lesson.json>`, then inspect the page and any controls in a browser. Read `cli.md` for session commands.

With no companion (a local file, a delegated run, no consent): the lesson renderer needs a session, so build the same page as one standalone file from the shared layer (`shared-ui.md`): a `ui-work` for each derivation, `ui-range` and `ui-waffle` where a figure helps, and a live model (`live-model.md`) when the reader should type their own values. Keep the Explain habits: the answer first, a cited source for every claim, and each observed result taken from a run of the real code. Say in the handover that you used no lesson spec.

A walkthrough can explain a path in order; a change story can compare before and after; a trace can follow a value through transforms. These are optional structures, not mandatory sections. Keep one answer and avoid repeating the same facts in multiple blocks.

Complete examples: `examples/lesson-request.json` and `examples/lesson-retry.json`. Their numbers are illustrative, not observations from a user's code.

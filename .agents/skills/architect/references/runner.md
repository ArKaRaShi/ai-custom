# Architecture candidate guidance

Produce one independent candidate for the grounded task. Write consumer usage and two or three realistic call sites first; derive types and interfaces from those examples. Include a module map for larger changes and use the rationale template linked from the architect skill.

Trace dominant access patterns through the proposed data structures. Hide transport and implementation details behind a small public interface. State invariants, validation boundaries, ownership of shared state and idempotency where relevant. Prefer isolated writers and merge at read boundaries when multiple actors would otherwise mutate the same state. Encode invariants in types where practical. Keep call chains short and derive repeated data rather than synchronizing copies.

Use signatures and pseudocode to expose difficult behavior without claiming the design is implemented. Call out tradeoffs and genuinely distinct alternatives. Deliver the candidate in the assigned isolated location; do not change the shared working tree.

Adapted from [pstack architect runner prompt](https://github.com/cursor/plugins/blob/main/pstack/skills/architect/references/runner-prompt.md), MIT.

# Route by reader goal through four workflows

The skill answers four different requests: how a mechanism works, what the evidence says, which option to pick, and what a product page should look like. `SKILL.md` is a router that sends each request to one workflow file. One long page had made the agent explain and judge in the same breath. The routing key is the reader's goal, not the publishing command (`push`, `page`, `compare`, `states`). One command serves two goals, and the goals disagree about what the screen should say. Investigate became its own route because its output is evidence with sources and no analogy, so `recipes/trace.md` went with it. A reader asking "where does this number come from" is not learning a mechanism. Decide and Design are separate because a comparison ends in a recorded choice, while a prototype ends in an approved artifact.

## Consequences

- Interaction covers authored states only: reusable position and inspector primitives, with no expression evaluator, so a screen cannot compute a wrong answer. Live computation would need a per-request generator, which is a different product with a different host contract.
- The skill runs from a bare checkout with nothing to install: vanilla custom elements, plain CSS, and no network calls. `compare` and `states` keep their sandboxed iframes with scripts disabled.
- Consent, session lifecycle, the format ladder, and the review gate live once in `SKILL.md`. A workflow file links to them and never restates them, so changing the ladder is a one-line edit.

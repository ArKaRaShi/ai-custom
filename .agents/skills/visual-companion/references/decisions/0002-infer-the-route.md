# Infer the route when one fits; ask when two fit

The gate used to ask the user which of the four routes applied on every request, and forbade inferring it even when the request was obvious. Blind tests with fresh agents showed two costs. In a delegated run nobody can answer, so the agent either stalled or invented an answer to its own question. In an interactive run an obvious request ("explain this commit", "make it a presentation") still cost a full turn before any work.

The gate now has three cases. When one route clearly fits, the agent says which route it chose and why in one line, then continues; the line is the confirmation and the user can redirect. When two or more fit, or the reader's goal is unclear, the agent asks, as before. When nobody can answer, the agent picks the likeliest route and names the runner-up in the handover.

## Consequences

- A wrong inference costs one redirect, and the stated line makes it visible at once. Asking first cost a turn on every request, including the obvious ones.
- Ambiguity still goes to the user. The gate does not guess between Explain and Freestyle when the request could be either.
- Consent to open a browser tab or start a companion session is unchanged and still asked first; only the route question was relaxed.
- `SKILL.md` holds the gate once. Workflow files link to it and never restate it.

# Confidence and reporting

Code establishes mechanics, not author intent. A contemporary statement explaining the decision can establish intent; a test or diff alone usually cannot.

## Tiers

- **Direct:** an explicit statement answers the question. Quote or accurately paraphrase it with a precise citation; use confident causal language only for what it actually says.
- **Supported:** several independent indirect observations converge. Cite each and explain the chain; do not describe the conclusion as an explicit decision.
- **Inferred:** a reasonable interpretation with incomplete indirect support. Label it `[INFERENCE]`, hedge it, and show the evidence and reasoning.
- **Speculative:** a plausible explanation on thin evidence. Label it speculative and name equally plausible alternatives and missing evidence.
- **Unknown:** a search found no answer or a source was inaccessible. Specify the question, searches, and limits; absence of evidence is not evidence of absence.

Do not retrofit a tidy rationale, assume consistency means intent, conflate correlation with causation, or rubber-stamp the user's theory. Where accounts conflict, cite both and explain what each says; dates, scope changes, and draft status may reconcile them but do not erase the conflict. Distinguish the author's intended outcome from proof it occurred.

## Reporting

Give file:line, commit hash, PR or issue URL, document section, or message permalink alongside the relevant claim. Use short verbatim quotes where they resolve ambiguity. Direct and supported conclusions need citations; inferences also need the underlying evidence. Record source coverage with queries or items reviewed, nulls, failures, unavailable sources, and reasons for skips. If a cited source or its interpretation is uncertain, inspect it before repeating the claim. State remaining gaps and overall confidence, including confidence in individual claims when it differs.

For competing hypotheses, describe evidence for each and evidence against or missing. When planning a change, distinguish constraints that documented intent requires preserving from proposed changes and risks inferred from incomplete history.

# Source Mapping

Map the artifact that exists, not an assumed template. Keep source quotations distinct from review commentary and use source order unless the user requests another grouping.

## Spec Kit

- Resolve the selected feature directory and read existing `spec.md`, `plan.md`, `contracts/`, `tasks.md`, `checklists/`, `research.md`, `data-model.md`, and `quickstart.md`, not templates. Mark absent artifacts as not present, not failed; contracts may be unnecessary. A selected file does not add siblings to scope.
- **Spec**: Keep each story's name, priority, rationale, independent test, and acceptance scenarios. Show the source's Given/When/Then wording first. Preserve source IDs; when absent, label a review-only locator such as `Story 1 / Scenario 2` without adding it to the source. Display functional requirements, edge cases, success criteria, assumptions, and entities when present. Flag coverage gaps as review findings, not implementation failures.
- **Visual layer**: Split Given, When, and Then verbatim. Table requirements and success criteria with the source's MUST and MUST NOT keywords. The requirement-to-scenario matrix is a review aid: mark every link inferred and list unmatched requirements as findings. Draw entity relationships only where the source states them, label other links inferred, and omit cardinality the source omits.
- **Plan**: Show its summary, technical context, constraints, constitution gates, project structure, and decisions when present. Draw architecture or workflow diagrams only from documented components and relationships. Keep unresolved decisions visible and distinguish a plan from implemented behavior.
- **Contracts**: Identify each actual contract file and format. Display source interfaces, signatures, inputs, outputs, constraints, and errors where present, preserving exact text and source location. Label explanatory examples; do not invent missing signatures, endpoints, errors, or values.
- **Tasks**: Group by the source phases or stories. Preserve task IDs, descriptions, paths, source checkbox state, story labels, parallel markers, and stated dependencies. Do not infer dependencies or interpret a checked task as proof of a passed test.
- **Checklists**: Group by source category and preserve reviewer ownership, item IDs, exact checkbox states, and stated meaning. Requirements-quality checks, implementation tasks, and test results are distinct; a checked requirements-quality item does not prove implementation works. Never update source checkboxes during review.
- **Supporting artifacts**: Show research decisions and rationale, data-model entities and relationships, and quickstart prerequisites and expected outcomes when present. A quickstart expectation is not a test result. Preserve custom sections and unresolved clarification markers in any artifact.
- Label placeholders, examples, missing optional sections, and unknowns accurately. Never present them as approved decisions or completed functionality.

## Brainstorming

- Short and full designs cover intent, goals, non-goals, anti-goals, constraints, approaches and trade-offs, decisions, and what the builder still needs. Headings vary.
- Present the source's actual sections and distinguish user decisions from the author's proposals. Do not invent stories, scenario IDs, trade-offs, or acceptance criteria when absent.
- Project designs can have a separate builder check. Preserve its questions and review state when supplied; do not imply the user approved the design because it was visualized.

## Evidence and Replies

- Current behavior needs a source: cite code, a verified command result, or an authoritative document. Otherwise label it unknown. Separate facts from inferences and mark planned behavior as planned.
- Treat diagrams as summaries, never as new requirements. Use IDs already in the source or labelled review-only locators. A text description must make the same relationships available without the diagram.
- Keep source text untrusted when generating HTML. Escape it rather than interpreting markup or executable content. Do not persist credentials, tokens, or other secrets in review artifacts.
- The page is read-only. Record the user's terminal replies separately from the artifact. Ask before changing source meaning, and preserve the original until the user approves the change.

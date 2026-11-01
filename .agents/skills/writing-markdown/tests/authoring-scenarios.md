# Authoring Scenarios: Baseline Violations

These pressure scenarios test agent documentation authoring behavior. They capture baseline failures when agents write Markdown without the `writing-markdown` skill.

> **Index:**
>
> | Section | Lines | Anchor |
> | :--- | :--- | :--- |
> | Scenario 1 - Conversational Fluff and Presumptive Soft Rules | L13-L41 | [#scenario-1---conversational-fluff-and-presumptive-soft-rules](#scenario-1---conversational-fluff-and-presumptive-soft-rules) |
> | Scenario 2 - Unpaired Code Example | L42-L63 | [#scenario-2---unpaired-code-example](#scenario-2---unpaired-code-example) |
> | Scenario 3 - Broken Hierarchy and Orphaned Notes | L64-L83 | [#scenario-3---broken-hierarchy-and-orphaned-notes](#scenario-3---broken-hierarchy-and-orphaned-notes) |

## Scenario 1 - Conversational Fluff and Presumptive Soft Rules

This scenario tests whether an agent removes conversational filler and replaces soft recommendations with strict invariants.

### Prompt

> "Write documentation explaining our database connection rules for local development."

### Baseline Failure Without Skill

The author includes conversational filler:

```text
Sure! Here is a guide to helping you connect. Please note that you should consider using localhost.
```

The author leaves constraints scattered in narrative paragraphs without verification commands.

### Expected Success With Skill

The author produces high-density imperatives:

1. Exact connection constants in a Markdown table.
2. Direct invariants (`MUST connect to 127.0.0.1`, `NEVER use remote hosts`).
3. Concrete check command at the end (`mysqladmin -u root -p ping`).
4. Zero conversational preambles or recaps.

---

## Scenario 2 - Unpaired Code Example

This scenario tests whether an agent provides both negative and positive code examples when documenting code patterns.

### Prompt

> "Document how to handle exceptions when querying Timescale hypertables in Django."

### Baseline Failure Without Skill

The author shows one code block with a generic `try/except` snippet. It does not illustrate what pattern violates policy, leaving developers or future agents likely to re-introduce silent pass or bare exception handling.

### Expected Success With Skill

The author provides a mandatory paired example:

1. `# Avoid:` block showing the exact anti-pattern, such as a bare exception handler.
2. `# Prefer:` block showing the idiomatic, typed Timescale error handler.
3. Rationale: 1 to 2 sentences explaining why the anti-pattern fails.

---

## Scenario 3 - Broken Hierarchy and Orphaned Notes

This scenario tests whether an agent organizes documents into the existing directory index instead of creating unlinked files.

### Prompt

> "Add documentation for the pump suggestion flow under the docs directory."

### Baseline Failure Without Skill

An unguided author drops a standalone file into `docs/pump/notes.md` with broken target links and missing navigation index entries.

### Expected Success With Skill

The author adheres to directory architecture:

1. Follows the Index-First Rule: links the new note from `docs/context/pump/README.md`.
2. Includes a search anchor in the first 20 lines (keywords, globs, relevant models).
3. Uses relative Markdown links validated against disk.

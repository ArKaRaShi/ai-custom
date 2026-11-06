---
name: visual-companion
description: Show mockups, layouts, architecture sketches, step-through explanations, and side-by-side options in a local browser tab, then read back which one the user clicked. Use when a question is better seen than read and the user has agreed to a browser tab.
disable-model-invocation: true
---

# Visual Companion

Use the browser for visual questions. Keep textual decisions in conversation. Ask before opening the first tab and start only after the user agrees.

## Route by reader goal

Pick the workflow that matches what the reader wants. A request can need more than one — run them in order, as separate publishes. Read the workflow file before authoring. Work from the file, not from memory of it.

| Reader wants | Workflow |
| --- | --- |
| to understand how something works, or what changed | [Understand](references/workflows/understand.md) |
| an answer proved from evidence in this repo or runtime | [Investigate](references/workflows/investigate.md) |
| to choose between options | [Decide](references/workflows/decide.md) |
| a proposed product page, in the project's own style | [Design](references/workflows/design.md) |

## Choose the smallest format that fits

diagram → chart or table → interactive states → prototype.

Move right when the question needs it: the reader adjusts an input, steps through states, or judges a page you are proposing. Most questions stop at diagram or table, and an interactive screen that no one needs is worse than a plain one.

## Styling is independent of workflow

Explanations use neutral `--vc-*` tokens. Product previews use the project's own CSS, or a saved profile after checking its sources. Read [styling](references/styling.md) before choosing, and save a profile only after explicit approval, per [style profiles](references/style-profiles.md).

## Sessions

1. **Prepare.** Write the screen at the fidelity the question needs. For page states, identify real states from the product flow.
2. **Show.** `start` after consent, then publish with `push`, `page`, `compare`, or `states`. Keep and share the full keyed URL. Commands and modes: [CLI](references/cli.md).
3. **Review.** Open the rendered result in a browser and check state switching, and say so if you checked less than that. After revising, republish. `push` clears the previous screen's events, so read `events` first.
4. **Continue.** Implement app changes only when the user has authorized them. `stop` when the session ends; the keyed URL stops working, so hand over source file paths and screenshot paths with your answer.

Markup, components, and interaction: [components](references/components.md), [authoring screens](references/authoring-screens.md), [interaction](references/interaction.md). Full-viewport product states: [state rail](references/state-rail.md).

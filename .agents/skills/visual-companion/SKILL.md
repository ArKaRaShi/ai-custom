---
name: visual-companion
description: Show mockups, layout sketches, architecture sketches, and side-by-side visual options in a local browser tab, then read back which one the user clicked. Use when a question is better seen than read and the user has agreed to a browser tab.
---

# Visual Companion

Use the browser for visual questions such as mockups, layouts, diagrams, and alternatives. Keep textual decisions in conversation. Ask before opening the first companion tab and start only after the user agrees.

## Core principle

Show what matters in context. Default to visual mockups without complete application logic. Small demonstration interactions are fine; build full functionality only when explicitly requested.

## Workflow

1. **Understand.** Identify the visual question and relevant project area. Follow the user's reference or existing styles. Check for a matching project profile when suitable. For a new direction, design independently.
2. **Prepare.** Create a preview at the fidelity needed for the question. For page states, identify real states in the product flow and show each in context.
3. **Show.** Start the companion after consent and publish the preview. Keep and share the full keyed URL. Read [CLI](references/cli.md) for commands and session details.
4. **Review.** Inspect the rendered result and state switching in a browser when available; disclose if unverified. Gather user feedback and revise. Republish state sets with `states`, not a single-screen `push`.
5. **Distill.** After explicit approval of a project-specific design, save confirmed reusable visual CSS for that area. Read [style profiles](references/style-profiles.md).
6. **Continue.** Implement app changes only when the user has authorized them. Stop the companion when the visual session ends. The keyed URL stops working after `stop`, so hand over the source file paths and screenshot paths with your answer.

## Choose a presentation

- Show one design as a complete preview.
- Compare alternatives at a readable size.
- Use the [state rail](references/state-rail.md) for complete page states without losing surrounding context. The rail is outside each isolated static preview.
- Use the [explain-visually playbook](references/explain-visually.md) when the reader says they don't understand something, or asks you to explain, illustrate, walk through, or trace it. It picks a recipe and sets the order: answer first, then steps and an example.

For neutral chat visuals, use the companion theme tokens and explicit text/surface pairs rather than hardcoded colors. Preserve project-specific styles in product previews. For markup and companion components, read [authoring screens](references/authoring-screens.md) and [components](references/components.md). For project styles, asset staging, isolation, and interaction limits, read the relevant linked reference.

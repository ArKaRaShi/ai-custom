---
name: visual-companion
description: Show mockups, layouts, architecture sketches, step-through explanations, and side-by-side options in a local browser tab, then read back which one the user clicked. Use when a question is better seen than read and the user has agreed to a browser tab.
disable-model-invocation: true
---

# Visual Companion

Turns a question into a visual the reader can follow without asking you: a page, slides, a product mock or a lesson. A local HTML file needs no consent. A companion session or browser tab needs the user's yes before the first tab; when the user has approved it or asked you to publish, start the session and publish instead of stopping at a local file.

## Rules

Apply these in order: route, reader load, form, pictures, sessions.

### Settle the route first

Before reading a workflow or writing anything, name the route.

| Route | The reader wants | Read |
| --- | --- | --- |
| Prototype | a product page, or a choice between visual directions | [prototype](references/workflows/prototype.md) |
| Explain | a mechanism, or an answer proved from evidence, as a spec-driven lesson | [explain](references/workflows/explain.md) |
| Presentation | slides or a talk, asked for by name | [presentation](references/workflows/presentation.md) |
| Freestyle | anything else; the default form is a vertical page | [freestyle](references/workflows/freestyle.md) |

- One route clearly fits: say it in one line ("Route: Presentation, because you asked for slides") and continue. The user can redirect you.
- Two or more fit, or the goal is unclear: ask, with a one-line description of each, and recommend one.
- Nobody can answer (a delegated run): pick the likeliest route and name the runner-up.
- Start the handover, your final message, with `Route: <route>, because <reason>`. Then give the path of what you built (not the session URL, which dies at `stop`) and what you checked and did not check.

A request can need more than one route: run them in order, as separate publishes. Read the workflow file before authoring and work from it, not from memory.

### Reader load

Optimise for the effort the reader needs to follow the screen, not for how much you can show. The reader cannot ask what you meant and holds few things in mind.

- Define a label where it first appears. Never name a thing so it passes for something else the reader would look for.
- Draw what you would describe: a screenshot, else a `ui-mock`.
- Point by name and make it a link (`ui-ref`): "Setup, slide 4", not "the next slide".
- Keep one claim in one place. If two tabs or slides must be open to follow it, merge them.
- Make the static form complete; scripts only make it easier.
- Lead with the answer. Keep a one-line definition for each word the reader cannot place and cut the rest.
- For a reader new to the domain's words: an everyday picture, then real values, then the real code running ([plain to code](references/plain-to-code.md)).
- Cold read: hand the result to an agent that knows nothing and ask it to list every term or element it cannot place.

### The default form

Freestyle builds a vertical page from `templates/page.html`: the verdict as the headline, one section per claim with its source under it, a `ui-nav` menu from three sections up, and a live model where the reader's own numbers matter ([live model](references/live-model.md)).

When five or more items share one shape (findings, failures, options):

- Rank them. Show the few that matter in full. Make every other item a one-line `<details>` row: closed it says the problem, the fix and the cost; open it shows the evidence. Keep fewer than five items open.
- Show before and after side by side, with only what changed marked. A toggle or tab shows one side, so use neither.

### Pictures, layer and floor

- Pick the picture by what the content is ([figures](references/figures.md)).
- Move a figure only when the claim is about order in time ([motion](references/motion.md)); nothing plays by itself.
- Start from the shared layer ([shared UI](references/shared-ui.md)). A full page that does not must say why: `<meta name="own-style" content="reason">`.
- Meet the [quality floor](references/quality-floor.md). Before handover run `bun scripts/ui.ts check <file>` and `npx impeccable detect <file>`; both are advisory.
- With no companion, run `bun scripts/inline-ui.ts in.html out.html` and hand over `out.html`.
- Prototype: match the project's styling ([styling](references/styling.md), [style profiles](references/style-profiles.md)).

### Sessions

Only when you use the companion; a local file skips them.

1. **Prepare.** Write the screen at the fidelity the question needs. For page states, find the real states in the product flow ([authoring screens](references/authoring-screens.md), [state rail](references/state-rail.md)).
2. **Show.** `start` after consent. Publish with `explain`, `push`, `compare` or `states`, and share the full keyed URL ([CLI](references/cli.md)).
3. **Review.** Open the rendered result and check state switching; say so if you checked less. `push` clears the previous screen's events, so read `events` first.
4. **Continue.** Implement app changes only when authorized. `stop` at the end.

## The tests

- Does the chosen route match the reader's goal?
- What must the reader already know here, and how many hops to understand one claim?
- Did the browser review exercise the actual published screen?
- Is any product implementation separately authorized?

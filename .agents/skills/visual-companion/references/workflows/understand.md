# Understand

Use when the reader wants to understand how something works or what changed: "explain", "illustrate", "walk me through", "why is v2 different", "help me get this concept". These screens explain and use bundle mode with `--vc-*` tokens. Leave project CSS to product previews.

Route elsewhere when the reader wants a specific number or event proved ([Investigate](investigate.md)), a choice between options ([Decide](decide.md)), or a proposed product page ([Design](design.md)).

## Pick a recipe

| Reader asks | Recipe |
| --- | --- |
| "How does X work?" "Walk me through it." | [walkthrough](recipes/walkthrough.md) |
| "What changed?" "Why is v2 different?" | [change-story](recipes/change-story.md) |

When a question fits two recipes, build one explanation. Start with the recipe that matches the question, then add the other as a later section. Example: a change-story that needs proof of its effect ends with a short example section.

When no recipe fits, use the five-part order and the rules below anyway. Add a new recipe only after two separate questions needed the same five-part layout.

## Five-part order

Every explanation uses this order:

1. **Answer.** One `vc-answer` card with the conclusion in plain words. A reader who stops here still knows the result.
2. **Model.** One everyday analogy or picture, in at most two sentences.
3. **Steps.** At most five, with one idea per step. Put the remaining steps in one `vc-collapsed` element.
4. **Example.** One worked example with real numbers that runs through every step.
5. **Next action.** What the reader decides or does next.

Publish a short explanation with `push`. Measure the page height with every `vc-collapsed` closed. When it exceeds about two viewport heights at 1280×800, split the parts into up to five section files and publish them with `page`, answer first. `page` stacks every section on one scrolling page with a thin section rail. With `page`, drop the recipe's `<h1>`: each section already gets a heading, and the companion title comes from `--title`. The next action becomes its own last section. Do not use `states` for explanations: it shows one part at a time.

When the mechanism has positions the reader should move through — commits, requests, rounds, retries — add a position control and inspector from [interaction](../interaction.md). Use tabs with arrows for up to about six short-named positions; use a scrub instead of visible tabs for longer sequences. A cause line, segmented time bar, and folded raw values can follow the same position. See [request path](../../examples/request-path.html). For levels of detail, use a ladder as in [retry ladder](../../examples/retry-ladder.html). [understand-rebase](../../examples/understand-rebase.html) is another worked blueprint.

## Pick a diagram kind

Match the kind to the question with the table in [diagram kinds](../interaction.md#diagram-kinds), whose positions table links a worked example for each kind. Syntax is in [components](../components.md#diagram-kinds) and the geometry rules are in the [diagram contract](../interaction.md#diagram-contract).

Use one diagram per section and keep it to 12 parts or fewer. The diagram shows every path; the tabs follow the one path the example takes. Link each tab to its nodes with `data-focus`, and tie key words to nodes with `vc-term data-node`. When one question needs two kinds, such as the messages of a request and the states of its order, give each kind its own section.

## Rules

- **Answer first.** Section 1 gives the conclusion. Later sections only support it.
- **One next action, at the end.** Put supporting material, such as why the result matters, before the final next action.
- **Show only what the question needs.** Unchanged or routine steps go into one `vc-collapsed` line, such as "6 steps unchanged". When more than five steps matter, show the five with the largest effect and list the rest in a second `vc-collapsed` line, such as "2 smaller changes".
- **Say each fact once.** Do not show the same comparison as both a flow and a table.
- **Never mark meaning with color alone (WCAG 1.4.1).** Each `data-diff` step also shows a text badge: `New`, `Changed`, or `Removed`. A step that is not a change has no `data-diff`. It may still show a badge with any short word and a `data-tone`, such as `Risk` with `danger`.
- **Keep text contrast at 4.5:1 or more (WCAG 1.4.3).** Use `--vc-fg` or `--vc-muted` on `--vc-bg` or `--vc-surface`. Do not lighten text with opacity.
- **Use a diagram when it helps.** Pick the kind as above, or use custom SVG with an accessible label. For interaction and a static legend, follow the [diagram contract](../interaction.md#diagram-contract); see [branching request](../../examples/branching-request.html).
- **No text below 12px.** Secondary lines use `vc-step-note`.
- **Put numbers next to their step.** Show a changed value as `<span class="vc-delta"><del>{old}</del><ins>{new}</ins></span>` beside its step. The stylesheet draws the arrow, so do not type one. `del` is always the old or baseline value, and `ins` is the new or actual value. A baseline comparison can use `vc-delta` without `data-diff`. Use `data-diff` for a changed step. A small table is fine inside the worked example, but do not repeat the steps as a separate table.
- **Use plain words before jargon.** Define a term the first time it appears, in the step or analogy line where it first shows up.
- **Mark guesses.** Prefix inferred claims with `[Inference]`. Label illustrative numbers.
- **Compare against a baseline when nothing changed.** A question about one version has no old value. Contrast with the simplest baseline instead, such as the result without the factor that moves it most, and name that baseline.

## Check before showing

Open the rendered screen and confirm:

1. The first card states the answer.
2. Each `data-diff` step shows a text badge.
3. Every fact the answer depends on is visible without opening `vc-collapsed`.
4. The explanation uses five sections or fewer.
5. Any position control announces the current state by name, and its inspector matches what the panel shows.
6. Each diagram shows no geometry or budget note, and each tab lights the nodes its text names.

Scroll to the top before a full-page screenshot. Otherwise the screenshot captures the sticky status bar mid-page.

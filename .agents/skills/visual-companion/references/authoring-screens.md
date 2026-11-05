# Authoring screens

A screen is one HTML file. How it is served depends on what is in it.

## The two modes

| | Bundle | Plain |
| --- | --- | --- |
| Trigger | no `<!doctype>`/`<html>` (or `--bundle`) | whole document (or `--plain`) |
| Gets | frame, `components.css`, `components.js`, client | client only, nothing restyled |
| Use for | quick layout options, mockups, diagrams | the user's real design language, pasted components, screenshots wrapped in a page |

Both modes share one rule: **any element with `data-choice` records a click.** The attribute value is what the agent receives.

```html
<!-- bundle: short, consistent, cheap -->
<div class="vc-options">
  <button class="vc-option" data-choice="a">
    <span class="vc-letter">A</span>
    <span><h3>Single column</h3><p>One reading column, no chrome</p></span>
  </button>
  <button class="vc-option" data-choice="b">
    <span class="vc-letter">B</span>
    <span><h3>Sidebar + content</h3><p>Persistent navigation on the left</p></span>
  </button>
</div>
```

```html
<!-- plain: the page keeps its own CSS -->
<!doctype html>
<html>
  <head><link rel="stylesheet" href="/files/their-design-system.css" /></head>
  <body>
    <button data-choice="a">Single column</button>
    <button data-choice="b">Sidebar + content</button>
  </body>
</html>
```

Put a `data-multiselect` attribute on an ancestor to allow more than one selection.

## Composition rules

1. **One question per screen.** Say it in the heading, not in the filename.
2. **2–4 options.** More than four stops being a comparison.
3. **Explain the question on the page** — "Which layout feels more professional?", not just "Pick one".
4. **Fidelity follows the question:** wireframes for layout, real polish only for a polish question.
5. **Real content beats lorem ipsum** when the content is what is being judged.
6. **New file per iteration** (`layout-v2.html`) so the previous version stays readable.
7. **Screens are disposable**; the decision is the artifact. Once it is settled, say what was chosen and where it lives.

## Accessibility, for free

Use the components and this is handled: real `<button>` elements, keyboard focus rings, `aria-pressed` on selections, arrow-key tab switching, `prefers-reduced-motion`, and a layout that survives a 320 px viewport. Plain mode is your own responsibility — keep `data-choice` on a `<button>`, not a `<div>`.

## What the frame provides

The frame adds a status bar with a connection dot ("connected" / "reconnecting…" / paused overlay), the page title from `--title`, and the client that reports clicks and reloads the tab when you push again.

Theme hooks, if you want a screen to match a product palette:

```html
<div class="vc-card" style="--vc-accent:#0f766e; --vc-radius:4px">…</div>
```

For neutral chat visuals, use the frame's `--vc-*` tokens instead of hardcoded colors; pair `--vc-fg` or `--vc-muted` with `--vc-bg` or `--vc-surface`, and `--vc-accent-fg` with `--vc-accent`. The frame defaults to the system theme; its Theme control saves a local browser preference for system, light, or dark. Storage failures fall back to the current session. Plain pages and isolated product iframes use their existing styles.

Variables: `--vc-bg`, `--vc-surface`, `--vc-fg`, `--vc-muted`, `--vc-border`, `--vc-accent`, `--vc-accent-fg`, `--vc-ok`, `--vc-warn`, `--vc-danger`, `--vc-radius`, `--vc-gap`, `--vc-font`, `--vc-mono`.

The scale behind those: `--vc-radius-xs|sm|lg` beside `--vc-radius`, `--vc-space-1` through `--vc-space-5` for the 4/8/12/16/24 rhythm, `--vc-text-xs|sm|md|base|lg|xl`, `--vc-measure` (68ch) for prose, and `--vc-bar-h` for the sticky bar. Position anything sticky with `calc(var(--vc-bar-h) + …)` instead of a measured number. A long screen title truncates to one line rather than pushing the Theme control off a narrow screen.

## Spacing belongs to containers, not components

No component sets its own margin. A card, a stat, an answer and a table each sit flush against whatever follows, because a component that moves itself cannot be placed twice.

Each container sets the distance between its children:

| Container | Distance |
| --- | --- |
| `.vc-main` (the frame) | `--vc-space-4` between top-level children; a heading sets its own margin for the line under it |
| `.vc-stack` | `--vc-gap` |
| `.vc-grid`, `.vc-split`, `.vc-row` | their `gap`, which is `--vc-gap` |
| `.vc-page-body` | `--vc-space-7`, then `--vc-space-6` above each part after the first |
| inside a card | whatever the screen sets; nothing is inherited |

A `gap` applies only to a flex or grid box. A block container needs margins, and that is what `.vc-main` uses. Sibling margins collapse: a heading's bottom margin and the next block's top margin become the larger of the two, never their sum.

An inline `margin` on a child overrides the frame rule. That is the supported way to make one pair closer, and the reason a hand-set margin can look like a bug when it cancels the frame's `--vc-space-4`.

## Anti-patterns

- A screen that asks three questions at once — split it.
- Inline `style` on every element to fake a design system; the components already are one.
- A wide table with no `vc-scroll` around it: on a narrow screen it pushes the whole page sideways instead of scrolling inside its own region.
- Stacking cards as children of a bare `<div>` or `<section>`: the wrapper has no spacing rule and the cards touch. Wrap them in `.vc-stack`, or place them directly in `.vc-main`. `tests/spacing.test.ts` fails on this pattern and reports the file and line.
- A grid or flex container built with `1fr` instead of `minmax(0, 1fr)`: the track grows to a child's minimum width and overflows the viewport.
- `--plain` for a fragment: you lose the frame and the styles, and get unstyled markup.
- Screens referencing remote images unnecessarily; stage selected local files with the CLI and use `/files/<name>`. See [CLI](cli.md#stage).
- Pushing a fragment full of `<script>` tags. It runs, but nothing about the recording contract needs it.

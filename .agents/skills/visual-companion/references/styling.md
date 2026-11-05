# Styling

Pick the palette by the job, not by the workflow. An explanation of the project's checkout flow uses neutral tokens; a product preview of a generic pattern uses the project's CSS. Decide before authoring, and say which one you chose.

| The screen is | Use | Because |
| --- | --- | --- |
| explaining a concept, tracing a value, comparing options | neutral `--vc-*` tokens | the reader judges the idea, and brand styling adds noise and implies the design is settled |
| proposing a product page | the project's CSS, or a saved profile | the reader judges what their product would look like |

## Neutral

Bundle mode supplies the [components](components.md) and the frame's tokens. Pair each text colour with the background behind it: `--vc-fg` or `--vc-muted` on `--vc-bg` or `--vc-surface`, and `--vc-accent-fg` on `--vc-accent`. The frame follows the system theme and its Theme control saves a local preference, so check every screen in both themes.

Every pair in that list clears WCAG 2.2 AA — 4.5:1 for text, 3:1 for the focus ring and for a control's boundary. `--vc-border` is the decorative hairline for cards and table rules; `--vc-border-strong` is the 3:1 boundary a button, input, select or choice needs. Do not swap them, and do not set a border colour by hand on an interactive control.

Keep hex values out of an explanation. When one element needs a brand accent, set the token on that element rather than the page: `style="--vc-accent:#0f766e"`.

## Project

Read the project's own sources first. A saved profile shortens that reading; verify it against the sources when they may have changed. Stage each dependency and link it from the preview:

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" stage <project>/.visual-companion/styles/checkout.css checkout.css --project-dir <project>
```

Then reference `/files/checkout.css`. A whole document brings its own CSS; a fragment receives the companion stylesheet, so pass `--plain` when a fragment must escape it. Companion colours must not override the project's text, background, or accent values, and a staged local stylesheet takes precedence over a remote one.

## Contrast and colour

Hold text at 4.5:1 or better against the colour behind it. Meaning never rests on colour alone: a diff shows a word badge, a selection reports `aria-pressed`, a series gets a label. Secondary text uses `--vc-muted` or `vc-step-note` rather than reduced opacity on the primary colour.

## Saving a profile

Save only after the reader explicitly approves a project-specific design, per [style profiles](style-profiles.md): one file for the approved area, with its sources recorded in comments. Opening a preview and agreeing it looks fine is not that approval. A rejected design leaves `styles/` empty.

## Anti-patterns

- Neutral tokens over a product screenshot, or project CSS on a concept diagram.
- A saved profile forced onto a deliberate new direction.
- Root-relative or parent-escaping URLs in a preview; stage the file and use `/files/` instead.
- Mixing two palettes on one screen, which reads as an accident rather than a choice.

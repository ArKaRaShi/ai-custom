# Shared UI

Optional tokens and components shared by Explain, Presentation and Freestyle.

```text
assets/ui/
  themes/indigo.css    default (Explain's look): light + dark
  themes/paper.css     warm paper, orange accent; light only
  themes/paper-dark.css  dark only
  themes/modern.css    cool grey, blue accent; light only
  themes/modern-dark.css  dark only
  components.css       .ui-* components
  components.json      the contract
  presentation.css     slide layout
  ui.js                interactivity
```

## Ask the contract, do not read the CSS

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/ui.ts" list            # one line each
bun "$HOME/.agents/skills/visual-companion/scripts/ui.ts" show chip       # use, modifiers, structure, snippet
bun "$HOME/.agents/skills/visual-companion/scripts/ui.ts" check page.html # lint before handing over
```

`ui.ts check` is advisory. Errors (exit 1): unknown `ui-*` class, undefined variable, unfilled placeholder. Warnings: wrong modifier, hard-coded colour, table without `ui-table`, footers not matching the slide total, vague pointers ("next slide", "above"), `ui-ref` to a missing id, `ui-range`/`ui-waffle` without `role="img"` and `aria-label`, skipped heading levels, text below 11px, a full page using no shared layer (unless `<meta name="own-style" content="reason">`). Keep your own classes out of `ui-`. For the rest, run `npx impeccable detect page.html` and read `quality-floor.md`.

## Use it

Link a theme, `components.css`, (decks) `presentation.css`, and `ui.js` for interactive components. Set the theme with `<html data-ui-theme="paper">`; `indigo` is the default.

```html
<link rel="stylesheet" href="/assets/ui/themes/paper.css">
<link rel="stylesheet" href="/assets/ui/components.css">
<script src="/assets/ui/ui.js" defer></script>
```

A fixed-palette pair (`paper`/`paper-dark`, `modern`/`modern-dark`) does not follow the system. To follow it, link both, set `data-ui-theme` from `matchMedia("(prefers-color-scheme: dark)")`, and add a flip button; without scripts it stays light. `examples/band-score/page.tpl.html` shows the pattern over a live model (see `live-model.md`). The paper pair loads Geist and Instrument Serif from Google Fonts (system fonts offline); `impeccable detect` flags Geist, intended.

The companion serves `/assets/ui/*`. `compare`, `states` and `push --isolate` run under a strict CSP with scripts off: no web fonts, static form. For a standalone file, run `bun "$HOME/.agents/skills/visual-companion/scripts/inline-ui.ts" in.html out.html`; it replaces each `/assets/ui/` link with its content.

A component's `mode` is `static` (no JavaScript) or `both` (complete static form plus a `ui.js` layer). A deck without JavaScript stacks its slides; the deck script adds `class="deck"` to `<html>` and shows one at a time; → reveals the next `data-step` first.

## A theme is five groups of tokens

| Group | Tokens |
| --- | --- |
| Colour | `--background --foreground --card --card-foreground --primary --primary-foreground --secondary --muted --muted-foreground --accent --accent-foreground --destructive --border --input --ring`, and `--subtle` (muted text; defaults to `--muted-foreground`) |
| Shape | `--radius` |
| Fonts | `--font-sans --font-heading --font-mono` |
| Scale | `--ui-text`, the base size; components size in `em` from it |
| Status | `--warning`, `--success`; `components.css` has defaults; a theme sets them only when its background differs (paper, paper-dark set both) |

`--primary` is the main accent, `--accent` its pale tint. Deck sizes are fixed pixels (`.sub` 22px, `.foot` 12px); `--ui-text` scales only components.

A theme is `assets/ui/themes/<name>.css` with one rule, `:root[data-ui-theme="<name>"] { … }`, setting only changed tokens; with no dark palette, set `color-scheme: light`. Explain imports `themes/indigo.css` from `explain/styles.css`; after editing a theme, run `bun explain/build.ts`. A component is one CSS rule plus one `components.json` entry; `bun test` fails on a mismatch.

## Components

`ui.ts show <name>` gives use, modifiers, structure. Pointers:

- `ui-trace`: build with `scripts/trace.ts` (see `plain-to-code.md`, "trace a run").
- `ui-range`, `ui-waffle`, `ui-replay`: build with `figures.ts range`, `waffle` and `replay` (see `figures.md`, `motion.md`).
- `ui-status` (colours from `--destructive`, `--warning`, `--success`), `ui-cases`, `ui-work`: results and calculations.
- `ui-choice`: radios as chips; use instead of `<select>` up to about 12 options.
- `ui-nav`: sticky section menu. `templates/page.html` is the starting page (see `workflows/freestyle.md`).

The `ui-card` label and `ui-trace`/`ui-work` step titles are `h3`; put them under an `h2`. Tooltip, slider and chart exist only in Explain.

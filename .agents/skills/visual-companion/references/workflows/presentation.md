# Presentation

Use when the reader asks for slides or a talk; otherwise use a vertical page (see `freestyle.md`). No spec, no required sections. Weigh ideas against reader load (`SKILL.md`, "Reader load").

## Ideas for slides

- **Answer first:** open with the conclusion; later slides prove it, in a skeptic's order.
- **One claim per slide:** the title is a sentence ("The cache answers repeat requests"), not a topic ("Caching"). If it needs "and", split it.
- **A slide stands alone:** restate the fact it needs.
- **Concrete before abstract:** run one real input through it, then name the rule.
- **Change one thing at a time;** mark only what moved.
- **Draw the UI you describe:** a screenshot or `ui-mock` in the step's state.
- **Name every label at first use**; point to slides by name with a link ("Setup, slide 4"), not "the next slide".
- **Evidence beats assertion:** run the real code on the demo input, replacing only I/O. Label numbers observed, copied, or illustrative; footer the source path or command.
- **Less on screen:** cut words while the slide survives.
- **Pick the figure by content:** range bars, a cell grid for a percentage, small multiples for same-shape cases (see `figures.md`).

## Tools

All optional (see `shared-ui.md`). Skill directory `$HOME/.agents/skills/visual-companion`; scripts in `scripts/`.

- `templates/presentation.html`: starting deck (`paper` theme, `components.css`, `presentation.css`, `ui.js`, slide ids `s1…`).
- `ui.ts list`, `ui.ts show <name>`; parts: `ui-node`, `ui-card`, `ui-chip`, `ui-table`, `ui-mock`, `ui-ref`, `ui-reveal`, `ui-toggle`, `ui-trace`.
- For a reader new to the domain, show code with real data in and out (see `plain-to-code.md`); `ui-trace` and `scripts/trace.ts` capture real output.
- **Static form:** scripts off, slides stacked; survives `compare`, `states`, `--isolate`, PDF, pasted files. **Interactive form:** one slide at a time; → reveals the next `data-step` before advancing, ← goes back keeping steps shown, Space and Enter activate a focused button, `#s3` selects a slide. Keyboard only: a click never moves the deck. Keep static forms complete.
- `ui.ts check <deck.html>` is advisory; it cannot tell whether text matches your data or a mock matches the simulation. Also run `npx impeccable detect <deck.html>` and read `quality-floor.md`.
- Publish with `push <deck.html>`, no `--isolate`.
- **No companion** (local file, no consent): 1. copy `templates/presentation.html`; 2. fill every `@@…@@` placeholder and write the slides; 3. `bun scripts/inline-ui.ts in.html out.html` (inlines `/assets/ui/` links); 4. `bun scripts/ui.ts check out.html`. `out.html` is the deliverable.
- Screenshot each slide at 1280x720: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --screenshot=slide.png --window-size=1280,720 "file:///…/deck.html#N"`. `ui-reveal` steps leave a gap on first load; check revealed state in a browser. For static form, screenshot a copy with `<meta http-equiv="Content-Security-Policy" content="script-src 'none'">` in `<head>` at `--window-size=1280,6000`.

## Hard limits

- Every figure is observed, copied with its source, or marked illustrative. A simulation's result is observed only there; state its assumptions.
- Meet `quality-floor.md`: contrast, text of at least 11px, keyboard, headings in order, colour never the only signal.
- Hand over the HTML path, saying what you checked and not. Edit a one-off-script deck directly.

# Motion

Move a figure only when the claim is about order in time: events in a sequence, a state that changes, a retry. Every other claim is carried better by a still figure.

## Rules

- **One claim per replay.** Each event says what happened and why ("the lease expired, so another worker could claim it").
- **Animate only change.** The marker slides from one event to the next. Nothing loops and nothing plays by itself. Play runs once, 1.2 s an event, and under `prefers-reduced-motion` it jumps to the end.
- **Three to seven events.** Fewer is a sentence; more is a table or a ranked list.
- **Real events.** Times and states come from logs, code or a run. Mark anything made up "illustrative".
- **The static form is the answer.** With scripts off every event is stacked under its tick, so print, PDF and `compare` lose only the slide.
- **Order, not duration.** The ticks are evenly spaced. Put a long wait in the text ("15 minutes, nothing happens"), not in the axis.

## Build a replay

Write `events.json`: `time`, `title` and `because` on each event, an optional `state` for what holds afterwards, and an optional `label` for the axis. Then:

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/figures.ts" replay events.json
```

Paste the block under an `h2`, with a theme, `components.css` and `ui.js` linked. `examples/replay-export.json` is a complete file. `ui.ts check` warns when the ticks and events differ or the axis has no text alternative.

## Not here

Autoplay, loops, particles, 3D and page-load effects. Code stepped one line at a time is a `ui-trace`.

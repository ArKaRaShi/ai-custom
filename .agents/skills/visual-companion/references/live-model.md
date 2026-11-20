# Live model

Use when the reader changes an input and watches the answer, figure and calculation move.

## The pattern

1. **One formula file, no DOM.** It sets one global, e.g. `globalThis.bandModel = (size, reading) => ({ lo, hi, score, tone })`; the page inlines it in a `<script>` as the only calculation.
2. **A reference command**: the real code (or a small stand-in) printing one JSON object with the same keys: `python3 reference.py 75 74`.
3. **A spec of test points**: `bun scripts/model-check.ts spec.json` compares reference and model at every point.
4. **The page shows what the model returned**, rounded for display. Build the static default from a reference run.
5. **A choice among named values is a `ui-choice`**, not a `<select>`. A number is a number box beside a slider. A control that stops applying is disabled, its highlight cleared.

## The spec

```json
{
  "model": "model.js",
  "global": "bandModel",
  "command": "python3 reference.py {0} {1}",
  "fields": ["lo", "hi", "score", "tone"],
  "inputs": [[75, 74], [12.5, 58.3], [55, null], [5000, 110]],
  "tolerance": 1e-9
}
```

| Key | Meaning |
| --- | --- |
| `model` | formula file, relative to the spec |
| `global` | function name set on `globalThis` |
| `command` | shell command; `{0}`, `{1}`, ... become the inputs, `null` becomes `none` |
| `fields` | keys to compare |
| `inputs` | points to test |
| `tolerance` | largest allowed difference between numbers (default `1e-9`) |

Numbers agree within the tolerance; strings and `null` must be equal. The command runs through `sh -c` in the spec's folder.

## Choosing the points

The check proves agreement at your points only. Cover:

- an ordinary and a fractional case (12.5)
- each range edge, just inside and outside
- both sides of each threshold (score 50, score 75)
- `null`, zero, a very large value, a value that triggers the clamp
- the input landing exactly on each threshold: invert the formula (for score `s`, `reading = low + s / 100 × (high − low)`), then test a hair either side

## Show the numbers that were used

The shown calculation must reproduce the shown result: if the model used 12.5, the text says 12.5. Recompute from the page's numbers and compare with the page's result on at least ten inputs and a few hundred random ones. Show intermediate values with more digits than the result (see `figures.md`, "Formula, your numbers, result").

## Limits and example

The check tests the formula, not the drawing: click through the page; rerun when the real code changes.

`examples/band-score/` holds `model.js`, `reference.py`, `spec.json` and a page; read `page.tpl.html` (source), not `page.html` (built). Run `bun scripts/model-check.ts examples/band-score/spec.json`.

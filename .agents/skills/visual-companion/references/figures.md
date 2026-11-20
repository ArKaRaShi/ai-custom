# Figures

One claim per figure, chosen by content.

## Which figure for which content

| Content | Draw, and shared part |
| --- | --- |
| steps in order | stepper or stacked; `ui-work` calculation, `ui-trace` code, `ui-flow` overview |
| events in time order, each with a reason | replay: one event at a time on an axis, a marker that slides; `ui-replay`, `scripts/figures.ts replay` (`motion.md`) |
| one value in a range that depends on size | range bars on one axis, marker line; `ui-range`, `scripts/figures.ts range` |
| one percentage of a whole | 100 cells filled to the value; `ui-waffle`, `scripts/figures.ts waffle` |
| cases with one shape | small multiples, same layout, scale, order; `ui-cases` with `ui-case`, `ui-status` |
| options on several attributes | table, recommended row highlighted; `ui-table` |
| before and after | two panels side by side at the same scale, only what changed marked (for code, a `-` or `+` sign on each changed line); never `ui-toggle`, which shows one side at a time. Shared part: none yet, draw it yourself |
| five or more items sharing one shape (findings, failures, options) | ranked list: the few that matter in full, every other item a one-line `<details>` row whose closed state shows the problem, the fix and the cost, and whose open state shows the evidence. Shared part: none yet, use native `<details>` |
| words mapped to code | table: plain word, technical term, real code; `ui-table` |

Default: table; one number: large type.

## Rules for every figure

- **Caption states the claim**, not a topic.
- **Label in place.** Compared panels share a scale, or say so.
- **Status is a shape and a word:** `▲ Critical`, `◆ Warning`, `● Normal`, `◌ No data`; never colour alone.
- **Mark made-up data** ("illustrative"). **Name a cut-off** ("the score stops at 0").
- **Animate only change**; nothing loops; honour `prefers-reduced-motion`.
- **A verb on every arrow** (`writes`, `polls every 30 s`); **a ruler on every measured span** (64.7, 78.4); **numbered callouts** matching nearby text.
- **Words:** headings state the takeaway; sentences under 20 words, paragraphs 1 to 3 sentences; one term per concept; numbers carry unit and source.
- **Never:** gradient text, glass effects, emoji list markers, "above".

## Formula, your numbers, result

Per step (`ui-work`): `low = 38.0 + 6.19 × ln(P)`; `38.0 + 6.19 × 4.3175 ≈ 64.7253`; `64.7`.

- **Numbers shown are numbers used** (12.5 stays 12.5). A hand recomputation rounds to the shown result; test ten or more inputs with fractions and a clamped case.
- **Middle values carry three or more extra decimals** (`ln(75) = 4.3175`; `4.317` gives 64.722, not 64.725). Mismatch on hundreds of random inputs: 2 decimals 2 %, 3 decimals 0.2 %, 4 decimals 0.03 %.
- **Say numbers are rounded**; keep full precision in code. **Cut-off on its own line:** `≈ −23.9`, then `kept in 0 to 100 → 0.0`.
- **Numbers come from a run.** Live: test the real code (`live-model.md`). Static: `scripts/trace.ts` (`plain-to-code.md`).
- **Clickable:** `<a class="ui-ref" href="#ln-low">64.7253</a>`; with `ui.js` linked, the target flashes.

Checks: `ui.ts check <file.html>`, `quality-floor.md`, a cold read.

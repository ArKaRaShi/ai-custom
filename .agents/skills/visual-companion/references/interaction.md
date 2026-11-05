# Interaction

Reusable behaviours for screens the reader moves through, so a step-through is authored as HTML rather than as a one-off script.

## The rule

**Interactive means the reader moves through authored states.** The agent works out the states that matter, writes one panel each, and declares the fields the reader should inspect. The screen never evaluates an expression at runtime, so it cannot show a wrong result.

State the outcome and the controls in one sentence before building: "Move through the five rebase positions and inspect HEAD, index, and status at each." If that sentence is hard to write, the screen is doing too much.

This is the third rung of the format ladder. Reach it when stepping through states shows something a diagram or table cannot.

## Elements

| Element | Responsibility | Key attributes |
| --- | --- | --- |
| `vc-tabs` | the ordered set of authored states, one visible at a time | `active` (one-based) |
| `vc-scrub` | which state is current; a controller, never a container | `for` (container id), `label` |
| `vc-inspect` | the current state's declared fields, as a table | `for` (container id), `caption` |

```html
<vc-tabs id="rebase" active="1">
  <vc-tab label="1 · before" data-state='{"HEAD":"main","index":"clean"}'>…panel…</vc-tab>
  <vc-tab label="2 · conflict" data-state='{"HEAD":"detached c3d4","index":"conflict"}'>…panel…</vc-tab>
</vc-tabs>

<vc-scrub for="rebase" label="Rebase state"></vc-scrub>
<vc-inspect for="rebase" caption="Hidden state"></vc-inspect>
```

`vc-tabs` also exposes `panels` (labels and states), `select(index)`, and `currentState()`. It emits `vc-tab-change` with the zero-based index, and that is the only event these elements emit.

`data-state` is a flat JSON object of strings, parsed once when the element connects. Invalid JSON leaves the inspector empty and the panels working. `vc-inspect` draws a table only when the current panel declares state.

## Interaction rules

- **Keyboard first.** The scrub's range handles arrows, Home, and End; its buttons are tab stops that answer Enter and Space; Tab reaches every control in reading order.
- **Announce the state name.** Set `aria-valuetext` from the panel label so a screen reader says "2 of 4, Conflict" instead of "2".
- **Visible focus, always.** Leave the frame's focus ring intact; on a dark page it is the only cue that the keyboard is active.
- **Change in text as well as colour.** A field whose value differs from the previous position shows a text badge (`Changed`), per WCAG 1.4.1.
- **Readable with JavaScript off.** The first panel renders as ordinary markup, so a static copy in `states` or `compare` still shows something true.
- **One position owner per group.** Panels may contain their own `vc-tabs`; the inner group then controls the position. Do not nest a scrub inside a scrub.
- **Position is presentation.** Republishing resets to the first panel, and nothing about a position is stored.

## Where it runs

`push` and `page` execute scripts, and these elements run only there. `compare` and `states` disable scripts: the panels still render and the controls do nothing. Do not build behaviour that the sandboxed modes must support.

## What not to build

- An expression language, formula attribute, or computed field. Work the panel out first, then author it.
- A new recorded event. `data-choice` is how a screen reports a decision; moving between states is not one.
- A per-screen `<script>` for a composed walkthrough. When a screen needs real computation, say so and get approval for that one script first.

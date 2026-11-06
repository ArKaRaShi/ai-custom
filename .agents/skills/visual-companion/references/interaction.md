# Interaction

Reusable behaviours for screens the reader moves through, so a step-through is authored as HTML rather than as a one-off script.

## The rule

**Interactive means the reader moves through authored states.** The agent works out the states that matter, writes one panel each, and declares the fields the reader should inspect. The screen never evaluates an expression at runtime, so it cannot show a wrong result.

State the outcome and the controls in one sentence before building: "Move through the five rebase positions and inspect HEAD, index, and status at each." If that sentence is hard to write, the screen is doing too much.

This is the third rung of the format ladder. Reach it when stepping through states shows something a diagram or table cannot.

## Elements

| Element | Responsibility | Key attributes |
| --- | --- | --- |
| `vc-tabs` | the ordered set of authored states, one visible at a time | `active` (one-based), `arrows` |
| `vc-scrub` | controls long sequences without a visible tab bar | `for` (container id), `label` |
| `vc-cause` | current tab's `data-node` and `data-cause` | `for` |
| `vc-timebar` | value shares and a jump target for each tab | `for`, `unit`, `hint` |
| `vc-inspect` | the current state's declared fields and previous values | `for`, `caption`, `fold` |
| `vc-diagram` | laid-out text source or authored SVG, reachability and tab focus | `label`, `for` |
| `vc-term` | reusable definition, preview, pin and diagram link | `def` on first use, `data-node` |
| `vc-predict` | collect a guess before revealing its answer | `label`, `data-pick`, `data-correct` |
| `vc-contents` | navigate headings in a long screen | `variant` (`rail` for a compact rail) |

```html
<vc-tabs id="rebase" active="1" arrows>
  <vc-tab label="Before" data-node="Start" data-cause="The branch is clean." data-value="3" data-state='{"HEAD":"main","index":"clean"}'>…panel…</vc-tab>
  <vc-tab label="Conflict" data-node="Replay" data-cause="Both commits edit the same line." data-value="12" data-state='{"HEAD":"detached c3d4","index":"conflict"}'>…panel…</vc-tab>
</vc-tabs>
<vc-cause for="rebase"></vc-cause>
<vc-timebar for="rebase" unit="ms"></vc-timebar>
<vc-inspect for="rebase" caption="Hidden state" fold></vc-inspect>
```

`vc-tabs` also exposes `panels` (labels, states and node IDs), `select(index)`, and `currentState()`. Its `vc-tab-change` event carries the zero-based index; followers use it without owning a separate position.

`data-state` is a flat JSON object of strings, parsed once when the element connects. Invalid JSON leaves the inspector empty and the panels working. `vc-inspect` draws a table only when the current panel declares state.

Use tabs with arrows for up to about six short-named positions. For longer sequences, set `hide-tabs` on `vc-tabs` and use a scrub with its state-name label. A tab's `data-value` is a non-negative numeric share, `data-node` defaults to its label, and `data-cause` is one plain-text sentence.

## Composing an explanation

- **Diagram:** use `vc-diagram` and pick its kind from [diagram kinds](#diagram-kinds). Give it a `label`; link its `for` to a `vc-tabs` id for step focus. See [branching request](../examples/branching-request.html) and the contract below.
- **Ladder:** `vc-tabs variant="ladder"` presents levels of detail. Hover previews without changing the selected position; click selects it. Up and Down operate the vertical tab list. See [retry ladder](../examples/retry-ladder.html).
- **Terms:** define a term with `<vc-term def="…">term</vc-term>` or a native `<dl><dt>term</dt><dd>definition</dd></dl>`; a matching `<vc-term>term</vc-term>` resolves either. Definitions are scanned in document order and the first normalized match wins. Readers can preview and pin definitions. The native glossary remains readable without JavaScript; see [plain reference](../examples/plain-reference.html).
- **Prediction:** put `data-pick` buttons and a `vc-reveal` inside `vc-predict`; mark an answer with `data-correct` when there is one. Give each option a heading or `aria-label` for its short name; descriptions are excluded from announcements. The reader selects, then locks in to reveal. A lock-in records a choice; previewing a position does not.
- **Contents:** place `vc-contents` in a long reference to navigate its headings. For a plain document using its own styles, opt in as shown in [plain reference](../examples/plain-reference.html).

## Diagram kinds

Each kind has its own layout and reading direction. Every kind builds the same graph, so reach, step focus and term links work the same in all four. How to name a kind, its syntax and one example for each are in [components](components.md#diagram-kinds).

| The reader asks | Kind | Nodes and edges | Reads |
| --- | --- | --- | --- |
| How does the request travel, branch or retry? | `flow` | components, and the paths between them | left to right; top-down with a `TB` header or in a diagram narrower than 34rem |
| What is inside what? | `tree` | files, folders or owners; one parent per node | top-down, parents above children, siblings in the order written |
| Who says what to whom, and in what order? | `sequence` | participants, and messages in time order | participants as columns, left to right; messages as rows, top to bottom |
| What states exist, and what moves it between them? | `state` | states, transitions, retries and terminal states | top-down, each state below the states that lead to it |
| An ERD, a class diagram or another shape | hand-drawn SVG | your drawing, with the attributes in the contract below | as you draw it |

Pick by the question, not by the data. A lifecycle drawn as a flow hides which states are final, and a request drawn as a state diagram hides who sent it. Hand-drawn SVG keeps its own layout, so the geometry rules below are then yours to meet.

**Flow** is the default when the first line is not a kind. Its edges follow the path of the request.

**Tree.** Each node has one parent, and a tree may have more than one root. The diagram reports a second parent or a cycle on-screen and ignores that edge. Edges run from parent to child, so **What this feeds** marks what a node holds and **What feeds this** marks the nodes above it. See [file tree](../examples/file-tree.html).

**Sequence.** Messages appear in the order written. Edges run from sender to receiver, and a reply never feeds its receiver. A label sits above its message in the free span next to the sender, so it never crosses a participant's line; keep a label shorter than the gap between two participants. See [cache-miss sequence](../examples/cache-miss-sequence.html).

**State.** A self-loop such as `charging --> charging` is valid only in this kind. A retry that goes back to an earlier state is an ordinary transition, and reach handles the cycle. See [order lifecycle retry](../examples/order-lifecycle-retry.html).

### Positions for each kind

| Kind | Position pattern | Example |
| --- | --- | --- |
| `flow` | tabs with arrows, one tab per hop; `data-focus` names the hop's nodes, or `at` places one marker | [request path](../examples/request-path.html), [branching request](../examples/branching-request.html) |
| `tree` | tabs with arrows, one tab per branch; `data-focus` names a folder and what it holds; `vc-term data-node` ties words to folders; `vc-predict` asks where something lives | [file tree](../examples/file-tree.html) |
| `sequence` | tabs with arrows, one tab per run of messages; `data-focus` names the participants that talk; `vc-cause` gives the reason; `vc-timebar` when messages cost time; a folded `vc-inspect` for what each side holds | [cache-miss sequence](../examples/cache-miss-sequence.html) |
| `state` | one tab per position along one path through the machine, while the diagram shows every path; `data-focus` names the states entered and left; an unfolded `vc-inspect` shows the fields the events change; `hide-tabs` with `vc-scrub` past about six positions | [order lifecycle retry](../examples/order-lifecycle-retry.html) |

Give `data-focus` participant, state or node IDs only. The `Start` and `End` nodes of a state diagram have no ID you can write, so a tab cannot focus them.

## Diagram contract

Mark each node with a unique `data-node="id"` and each directed edge with `data-from="id"` and `data-to="id"`. A text source writes these for you; hand-drawn SVG must write them to join reach, step focus and term links. Optional `data-kind` on an edge is `default`, `emphasis`, `return`, `async`, or `security`.

The diagram reports a duplicate node ID, an unknown edge endpoint, an unknown `data-kind` and a self-edge on-screen and ignores each; a `state` diagram allows a self-loop. More than 12 parts shows a budget note on-screen, and a text source with more than 24 parts is an error that draws nothing. A sequence counts participants, not messages; a state counts its `Start` and `End` nodes.

Every text-source kind follows five geometry rules:

1. Every edge is right-angled; none runs diagonally.
2. A label never overlaps a node or another label.
3. Edges that share a side of a node attach at points at least 12px apart, and at least 16px where arrowheads share the side. Edges of one kind that leave or enter one side together share a single point.
4. Every edge kind has the same arrowhead size.
5. No edge passes behind a node that is not one of its endpoints.

Flow, tree and state check their own drawing. When one cannot meet rule 2, 3 or 5, it still renders and a `Layout warning:` note on-screen names the rule; rules 1 and 4 always hold. A sequence meets all five by construction and shows no note.

The drawing follows these habits as well. Edges of one kind that fan out of a node leave by one trunk and branch at one bend halfway between the ranks, and a fan-in joins the same way; an edge of another kind has its own point and never runs along them. An edge whose boxes overlap along the other axis runs straight. A self-loop uses one side of its node for both ends: the side with fewer edges, the right on a tie. A diagram wider than its card scrolls inside the card and shows a shadow at each clipped edge.

Select a node, then choose **What feeds this** or **What this feeds**. Pressing the active direction again toggles it off; **Clear** and Escape clear highlighting. Reachability handles cycles and excludes `return` edges: replies are not dependencies. Depth badges show hop distance. Status reads “These feed &lt;node&gt;: …” upstream and “&lt;node&gt; feeds these: …” downstream.

With `for` linked to tabs, each `vc-tab data-focus="id id"` names the nodes highlighted at that position. Alternatively, a tab's `at` names the node for the diagram's `marker`. A `vc-term data-node="id"` and its node highlight each other on hover or focus. Diagram highlight has one owner: `data-diagram-mode` is `idle`, `reach`, or `step`; reached nodes and edges use `data-reach-depth` and `data-reach-edge`.

Edge kinds differ in line shape as well as color: emphasis draws thick, return dashed, async dotted and security dash-dot. A text source gets a legend listing only the kinds it uses (Request, Main path, Reply, Background, Policy). For hand-drawn SVG, author a visible `vc-diagram-legend` listing only kinds present, so the complete SVG and legend remain readable without JavaScript. The component rebuilds that legend when scripts run.

## Interaction rules

- **Keyboard first.** The scrub's range handles arrows, Home, and End; its buttons are tab stops that answer Enter and Space; Tab reaches every control in reading order.
- **Announce the state name.** Set `aria-valuetext` from the panel label so a screen reader says "2 of 4, Conflict" instead of "2".
- **Visible focus, always.** Leave the frame's focus ring intact; on a dark page it is the only cue that the keyboard is active.
- **Change in text as well as colour.** A field whose value differs from the previous position shows `was` and its prior value, per WCAG 1.4.1.
- **Readable with JavaScript off.** Ordinary tabs show the first panel; a ladder shows every level under its label.
- **One position owner per group.** Panels may contain their own `vc-tabs`; the inner group then controls the position. Do not nest a scrub inside a scrub.
- **Position is presentation.** Republishing resets to the declared `active` panel (or the first), and nothing about a position is stored.

## Where it runs

`push` and `page` execute scripts, and these elements run only there. `compare` and `states` disable scripts: the panels still render and the controls do nothing. Do not build behaviour that the sandboxed modes must support.

## What not to build

- An expression language, formula attribute, or computed field. Work the panel out first, then author it.
- A new recorded event. `data-choice` is how a screen reports a decision; moving between states is not one.
- A per-screen `<script>` for a composed walkthrough. When a screen needs real computation, say so and get approval for that one script first.

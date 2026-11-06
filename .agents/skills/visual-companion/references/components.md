# Components

`assets/catalogue.json` holds the catalogue and is the source of truth. Do not memorise this page — read it on demand:

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" components          # compact, grouped: names, what they do, attributes
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" components --json   # the raw catalogue
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" gallery             # regenerate examples/component-gallery.html
```

Every name carries the `vc-` prefix. Components are CSS classes plus custom elements, loaded as ES modules from `assets/components/` (the `ELEMENTS` registry in `index.js` lists them; `register(registry)` defines each once; shared helpers live in `core.js`). No framework or build step is involved. Component behavior makes no network requests; the companion client connects to the local server.

The catalogue is v2: one `entries[]` list. To see the whole set at once, push `examples/component-gallery.html`: every class and element with a live specimen and a one-line note. `cli.ts gallery [--out <file>]` generates that page from the catalogue snippets, so it cannot drift; never hand-edit it. `tests/catalogue.test.ts` checks the catalogue itself.

`vc-grid` and `vc-split` are intrinsic: `--vc-cols` is a ceiling, and the grid wraps by its container width, down to one column. Place `.vc-stat` tiles directly inside `.vc-grid` for a responsive row of metrics; each tile can contain `.vc-label` and `.vc-stat-value`. See [request-path](../examples/request-path.html). CSS draws the option letters (A, B, C) on `.vc-option`; do not write them.

Accessibility is part of the component, not a pass at the end. `tests/contrast.test.ts` reads the palette from `components.css` and fails below 4.5:1 for text or 3:1 for a control boundary and the focus ring. `--vc-border` is decorative and may remain below 3:1; `--vc-border-strong` is the boundary of buttons, inputs, selects and choices. Focus rings are a two-pixel outline that `scroll-padding-top` keeps clear of the sticky bar, controls meet the 24-pixel target minimum, and forced-colors plus `prefers-contrast: more` are handled.

`vc-tabs` accepts one-based `active`, plus `arrows` for a short sequence or `hide-tabs` when `vc-scrub` controls a longer one. Its `vc-tab-change` event exposes the selected **zero-based** index as `event.detail.index`. `vc-cause`, `vc-timebar`, and `vc-inspect` read the selected position; `fold` hides raw values in a details element. `vc-chart` renders bars and defaults to a height of 200 pixels.

`vc-diagram` lays out four diagram kinds from a short text source whose first line names the kind: `flow`, `tree`, `sequence` or `state`. Any other kind, such as an ERD or a class diagram, is hand-drawn SVG that you lay out yourself. It still gets reach, step focus and term links when its nodes and edges have the attributes in the [diagram contract](interaction.md#diagram-contract), which also holds the geometry rules and the budget. The grammar and one example for each text kind follow in [Diagram kinds](#diagram-kinds); choosing a kind is in [interaction](interaction.md#diagram-kinds). The [component gallery](../examples/component-gallery.html) lists the kinds.

For authored positions, diagram contracts, definitions, predictions and reference navigation, see [interaction](interaction.md). Worked examples: [request path](../examples/request-path.html), [branching request](../examples/branching-request.html), [file tree](../examples/file-tree.html), [cache-miss sequence](../examples/cache-miss-sequence.html), [order lifecycle retry](../examples/order-lifecycle-retry.html), [retry ladder](../examples/retry-ladder.html), and [plain reference](../examples/plain-reference.html).

## Diagram kinds

Grammar for the text sources of `vc-diagram`, one example per kind. The first line is the kind, bare (`tree`) or as `kind: tree`; with no kind line the source is flow. A bare word that is not a kind becomes a flow node, but `kind: bogus` is an error that lists the known kinds. The parser skips blank lines and text after `%%`.

IDs match `[A-Za-z_][A-Za-z0-9_]*`. A node label is plain text without brackets, parentheses or braces. Edge kinds are `@default`, `@emphasis`, `@return`, `@async` and `@security`. A line that does not parse gets a line-numbered error, and the diagram draws nothing; this is not full Mermaid. Without JavaScript the page shows the source as text.

**Flow** accepts an optional `graph` or `flowchart` header with `LR`, `TB` or `TD`; nodes such as `api[API]` or `cache(Cache)`, each with an optional tone `:::ok`, `:::warn` or `:::danger`; `-->`, `-.->` (drawn as async) or `---` (no arrowhead) edges, chained on one line; an optional label as in `-->|miss|`; and an edge kind before the destination.

```html
<vc-diagram label="Branching request">
  flow
  api[API] --> cache(Cache)
  api -->|miss| db[Database]
  db --> @return api
</vc-diagram>
```

**Tree** takes one `id[Label]` per line (a bare `id` or a pill `id(Label)` also works), indented under its parent and optionally led by a dash or asterisk bullet; or `parent --> child` chains with the flow label and kind forms, as in `a -->|label| @emphasis b`.

```html
<vc-diagram label="Project folders">
  tree
  app[app/]
    src[src/]
      server[server.ts]
    tests[tests/]
</vc-diagram>
```

**Sequence** takes optional `participant id` or `participant id as Label` lines, then one message per line in time order: `a -> b: text` is a request, `b --> a: text` a return and `a ->> b: text` async. The text is required, and starting it with an edge kind, such as `@security`, overrides the arrow. Participants take their columns in the order they first appear, so declare them first to set the order.

```html
<vc-diagram label="Cache miss">
  sequence
  participant client as Client
  participant api as API
  participant cache as Cache
  client -> api: GET item 42
  api -> cache: look up item 42
  cache --> api: miss
  api ->> cache: store row
  api --> client: item 42
</vc-diagram>
```

**State** takes `[*] --> id` for the initial state, `id --> [*]` for a terminal state, and `id --> id: label` or `id -->|label| id` for a transition, with an optional edge kind before the target as in `id -->|label| @async id`. Use one label form per transition. A state is `id`, `id[Label]` or a pill `id(Label)`. Each `[*]` draws as a `Start` or `End` node, shared by every initial or terminal transition.

```html
<vc-diagram label="Order payment">
  state
  [*] --> placed
  placed --> charging: submit
  charging --> charging: timeout retry
  charging --> paid: card accepted
  charging --> failed: declined
  failed --> charging: customer retries
  paid --> shipped: packed
  shipped --> [*]
</vc-diagram>
```

## Three worked examples

**Comparing two real layouts**

```html
<h1 class="vc-h1">Which dashboard reads better?</h1>
<p class="vc-muted">Same data, different hierarchy</p>
<div class="vc-split">
  <div class="vc-mockup">
    <div class="vc-mockup-head">A — stats first</div>
    <div class="vc-mockup-body">
      <div class="vc-grid" style="--vc-cols: 3">
        <div class="vc-stat"><div class="vc-label">Users</div><div class="vc-stat-value">1,240</div></div>
        <div class="vc-stat"><div class="vc-label">Churn</div><div class="vc-stat-value">2.1%</div></div>
        <div class="vc-stat"><div class="vc-label">MRR</div><div class="vc-stat-value">$18k</div></div>
      </div>
      <div class="vc-placeholder">chart area</div>
    </div>
  </div>
  <div class="vc-mockup">
    <div class="vc-mockup-head">B — chart first</div>
    <div class="vc-mockup-body">
      <div class="vc-placeholder" style="padding:48px">chart area</div>
      <div class="vc-row">
        <span class="vc-badge">1,240 users</span>
        <span class="vc-badge" data-tone="warn">2.1% churn</span>
      </div>
    </div>
  </div>
</div>
<div class="vc-options">
  <button class="vc-option" data-choice="a"><h3>Stats first</h3><p>Numbers up top</p></button>
  <button class="vc-option" data-choice="b"><h3>Chart first</h3><p>Shape before numbers</p></button>
</div>
```

**Data with a chart, no JavaScript**

```html
<div class="vc-card">
  <div class="vc-card-head"><h2 class="vc-h2">Requests per region</h2><span class="vc-badge">24h</span></div>
  <vc-chart data="EU:120,US:210,APAC:64" label="Requests per region"></vc-chart>
</div>
```

**Tabs for alternatives that need their own space**

```html
<vc-tabs active="1">
  <vc-tab label="Compact">
    <table class="vc-table">
      <thead><tr><th>Field</th><th>Type</th></tr></thead>
      <tbody><tr><td>id</td><td>uuid</td></tr><tr><td>email</td><td>text</td></tr></tbody>
    </table>
  </vc-tab>
  <vc-tab label="Detailed">
    <div class="vc-proscons">
      <div class="vc-pros"><h4>Pros</h4><ul><li>small migration</li></ul></div>
      <div class="vc-cons"><h4>Cons</h4><ul><li>no audit trail</li></ul></div>
    </div>
  </vc-tab>
</vc-tabs>
```

## Why so few components

Only behaviour is a component. Card, Button, Badge, Table, Grid, and friends are classes because a wrapper element would add markup without adding anything — you can put any content inside a `class="vc-card"` div, and it composes with everything else. Tabs, the chart, and copy-to-clipboard are elements because re-deriving that behaviour per screen is where the bugs live.

If a screen needs something the catalogue does not have, write the HTML and style it inline with the `--vc-*` variables rather than inventing a new component. Propose an addition only after the same need shows up twice.

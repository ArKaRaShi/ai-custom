# Components

The catalogue lives in `assets/catalogue.json` and is the single source of truth. Do not memorise this page — read it on demand:

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" components          # compact: names, what they do, attributes
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" components --json   # the raw catalogue
```

Everything is namespaced `vc-`. Components are plain CSS plus three custom elements; there is no framework or build step. Component behavior makes no network requests; the companion client connects to the local server.

To see the whole set at once, push `examples/component-gallery.html`: every class and element with a live specimen and a one-line note. `tests/components.test.ts` fails when a catalogue entry has no specimen there, so the page cannot drift from the catalogue.

Accessibility is part of the component, not a pass at the end. `tests/contrast.test.ts` reads the palette from `components.css` and fails below 4.5:1 for text or 3:1 for a control boundary and the focus ring. `--vc-border` is decorative and may remain below 3:1; `--vc-border-strong` is the boundary of buttons, inputs, selects and choices. Focus rings are a two-pixel outline that `scroll-padding-top` keeps clear of the sticky bar, controls meet the 24-pixel target minimum, and forced-colors plus `prefers-contrast: more` are handled.

`vc-tabs` accepts a one-based `active` attribute. Its `vc-tab-change` event exposes the selected **zero-based** index as `event.detail.index`. `vc-chart` renders bars and defaults to a height of 200 pixels.

## Three worked examples

**Comparing two real layouts**

```html
<h1 class="vc-h1">Which dashboard reads better?</h1>
<p class="vc-muted">Same data, different hierarchy</p>
<div class="vc-split">
  <div class="vc-mockup">
    <div class="vc-mockup-head">A — stats first</div>
    <div class="vc-mockup-body">
      <div class="vc-grid" style="--vc-cols: 3; --vc-cols-mobile: 1">
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
  <button class="vc-option" data-choice="a"><span class="vc-letter">A</span><span><h3>Stats first</h3><p>Numbers up top</p></span></button>
  <button class="vc-option" data-choice="b"><span class="vc-letter">B</span><span><h3>Chart first</h3><p>Shape before numbers</p></span></button>
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

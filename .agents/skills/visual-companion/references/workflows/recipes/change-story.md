# Change-story

Use for "what changed?" and "why is v2 different?" This recipe shows changed steps only, so use [walkthrough](walkthrough.md) first when the reader does not yet know how the original works.

## Parts

1. `vc-answer`: the effect of the change on the result, with the number.
2. `vc-steps`: only the steps that changed. Each one has `data-diff` plus a text badge (`New`, `Changed`, `Removed`) and a `vc-delta` for its value.
3. `vc-collapsed`: one line that counts the unchanged steps and lists them inside.
4. Optional later state: a [trace](trace.md) of one example value through both versions.
5. Next action: the decision the reader must make about the change.

Keep the step order of the full pipeline so the reader can place each change. Do not lay out both versions side by side when most steps match.
When changes are new capabilities rather than pipeline stages, show each capability as a `New` step. Put supporting context, such as why the changes matter, before the final next action.

## Skeleton

Replace each `{placeholder}` with content from the question. Delete any step kind the change does not have.

```html
<h1 class="vc-h1">{old version} → {new version}: what changed</h1>
<div class="vc-stack">
  <div class="vc-answer"><p><strong>{result} goes from <span class="vc-delta"><del>{old value}</del><ins>{new value}</ins></span>.</strong> {why it matters, one sentence}</p></div>
  <ol class="vc-steps">
    <li class="vc-step" data-diff="add"><div><span class="vc-badge" data-tone="ok">New</span> {added step}</div><p class="vc-step-note">{example value}</p></li>
    <li class="vc-step" data-diff="chg"><div><span class="vc-badge" data-tone="warn">Changed</span> {changed step} <span class="vc-delta"><del>{old}</del><ins>{new}</ins></span></div><p class="vc-step-note">{what changed in how it works}</p></li>
    <li class="vc-step" data-diff="del"><div><span class="vc-badge" data-tone="danger">Removed</span> {removed step}</div><p class="vc-step-note">{what happens without it}</p></li>
  </ol>
  <details class="vc-collapsed"><summary>{N} steps unchanged</summary><p>{unchanged steps, in order}</p></details>
  <div class="vc-card"><strong>Decide:</strong> {decision}</div>
</div>
```

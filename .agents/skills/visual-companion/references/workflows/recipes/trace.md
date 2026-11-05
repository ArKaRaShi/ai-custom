# Trace

Use for "where does this number come from?" Follow one input value through each transform to the final number. The trace itself is the worked example. That merges parts 3 and 4 of the five-part order into one.

## Parts

1. **Answer:** `vc-answer` with the final number and the transform that moves it most. When there is no old version, compare against a named baseline, such as the result without that transform.
2. **Model:** one everyday analogy in a `vc-muted` line.
3. **Steps and example:** start with a `vc-card` that lists the starting values and says whether they are real or illustrative. Follow it with `vc-steps`, one step per transform. Each step shows the formula with values filled in as `vc-pre`, with the result in bold. When comparing two versions, show each changed result as a `vc-delta` and mark the step with `data-diff`.
4. **Next action:** what to check in real data.

## Skeleton

Replace each `{placeholder}` with content from the question. Repeat the plain step once per transform.

```html
<h1 class="vc-h1">Where {final value} comes from</h1>
<div class="vc-stack">
  <div class="vc-answer"><p><strong>{metric} = {final value}.</strong> {transform that moves it most, compared with {baseline}}</p></div>
  <p class="vc-muted">{everyday analogy}</p>
  <div class="vc-card">Input ({real or illustrative}): {starting values}</div>
  <ol class="vc-steps">
    <li class="vc-step"><div>{transform name} = {formula}</div><pre class="vc-pre"><code>{formula with values} = <b>{result}</b></code></pre></li>
    <li class="vc-step" data-diff="chg"><div><span class="vc-badge" data-tone="warn">Changed</span> {transform name} <span class="vc-delta"><del>{old result}</del><ins>{new result}</ins></span></div><pre class="vc-pre"><code>{formula with values} = <b>{result}</b></code></pre></li>
  </ol>
  <div class="vc-card"><strong>Next:</strong> {what to check in real data}</div>
</div>
```

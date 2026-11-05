# Walkthrough

Use for "how does X work?" and "walk me through it." Use [change-story](change-story.md) instead when the question compares two versions.

## Parts

1. `vc-answer`: what X does, in one sentence.
2. Model: one everyday analogy in a `vc-muted` line.
3. `vc-steps`: up to five `vc-step` items in run order. The worked example runs through the steps: each `vc-step-note` shows the example's value or message at that step. When the subject has no running value, such as a protocol, the note shows what that step sends or produces in the example.
4. `vc-collapsed`: setup or edge steps the reader can skip.
5. Next action: one `vc-card` with what to try or decide.

## Skeleton

Replace each `{placeholder}` with content from the question. Repeat the step once per stage, up to five.

```html
<h1 class="vc-h1">How {subject} works</h1>
<div class="vc-stack">
  <div class="vc-answer"><p><strong>{what it does, one sentence}</strong></p></div>
  <p class="vc-muted">{everyday analogy}</p>
  <p class="vc-muted"><strong>{term}:</strong> {plain-word definition}</p>
  <ol class="vc-steps">
    <li class="vc-step"><div>{step}</div><p class="vc-step-note">Example: {value after this step}</p></li>
  </ol>
  <details class="vc-collapsed"><summary>{N} setup steps</summary><p>{skippable steps}</p></details>
  <div class="vc-card"><strong>Next:</strong> {what to try or decide}</div>
</div>
```

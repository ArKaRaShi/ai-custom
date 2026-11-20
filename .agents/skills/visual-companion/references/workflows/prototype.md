# Prototype

Use for a proposed product interface or a visual choice between directions. Keep the decision in conversation; a review does not authorize implementation. A Prototype page keeps the project's own CSS, so add `<meta name="own-style" content="Prototype in the project's styles">` to its `<head>`; `ui.ts check` then does not ask for the shared layer.

1. Read the product's current styles and components. For a product proposal, use its own visual language and stage each required local asset under `/files/`.
2. For a choice, show one question and two to four options with a trade-off and recommendation. Use a plain HTML button with `data-choice` for each option.
3. Publish with `push` for an interactive screen, `compare` for separately styled static options, or `states` for full-viewport static states. Sandboxed previews do not run scripts or report choices.
4. Inspect the actual page in a browser, including narrow screens and any relevant theme, and check it against `quality-floor.md`. Read events before publishing a replacement; confirm the choice in conversation.
5. Save a style profile only after explicit approval of a project-specific design. Product implementation requires separate authorization.

The checkout example `examples/design-checkout.html` demonstrates a product proposal. See `cli.md`, `styling.md` and `style-profiles.md`.

## With no companion (a local file)

`push`, `compare` and `states` need a companion session. A local file needs none and needs no consent: build one self-contained HTML file and hand over its path. Choices are made in the conversation; a local file records no events.

1. Use the project's own visual language. If it ships a plain stylesheet, link it. If it does not (Tailwind, a component library), copy the tokens you need (colours, radius, type scale) into one `<style>` and say which source files they came from. Or use a theme and `components.css`. Then run `bun scripts/inline-ui.ts in.html out.html` so the file opens anywhere. `out.html` is the deliverable, and the one to check.
2. Switch states with radio buttons, not script. It works with scripts off and in print, and the browser handles keyboard and focus:

```html
<fieldset>
  <legend>State</legend>
  <label class="ui-button outline"><input type="radio" name="state" value="critical" checked> Critical</label>
  <label class="ui-button outline"><input type="radio" name="state" value="warning"> Warning</label>
</fieldset>
<div class="states">
  <section data-state="critical">…</section>
  <section data-state="warning">…</section>
</div>
<style>
  .states > [data-state] { display: none; }
  body:has(input[name="state"][value="critical"]:checked) .states > [data-state="critical"],
  body:has(input[name="state"][value="warning"]:checked) .states > [data-state="warning"] { display: block; }
</style>
```

   List one selector per state. `:has()` works in Chrome 105, Safari 15.4 and Firefox 121 or newer.
3. Show every state at once as well, so the reader can compare without clicking. `ui-cases` suits a result and a status (a number and a status chip). A product card with its own layout needs your own grid. Name each state with the status shape and word used in the product, or `ui-status` when it is a tone.
4. Make every radio label at least 44px tall and keep a visible focus ring. Hide the native radio dot only if the label still shows which state is selected.
5. Check it the way the companion would, on `out.html`: click each radio and count the visible states (exactly one), tab and arrow through the radios, look at 320px and 1280px, turn scripts off, run `ui.ts check` and `npx impeccable detect`, and read `quality-floor.md`.

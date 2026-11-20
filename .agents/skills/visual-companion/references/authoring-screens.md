# Authoring screens

Use a lesson spec for Explain. For Prototype, publish either a full HTML document or a fragment; a fragment gets the companion frame, and a full document keeps its own styling. Neither mode supplies a component library.

Use native buttons for choices:

```html
<h1>Which layout works better?</h1>
<button data-choice="single">Single column — simpler on phones</button>
<button data-choice="sidebar">Sidebar — more navigation space</button>
```

The `data-choice` value is recorded on click. Put `data-multiselect` on an ancestor only if several choices may be selected. Keep the decision in conversation and read events before republishing.

Stage local CSS, fonts and images individually under `/files/`. Isolated previews (`compare`, `states`, and `push --isolate`) do not run scripts or report choices. Use `push` without isolation for an interactive preview.

Use semantic HTML, keyboard-accessible controls, visible focus, adequate contrast and responsive layouts. Verify the actual preview in a browser, including at 320px and in relevant themes. Product previews use the project's styles rather than the companion frame's.

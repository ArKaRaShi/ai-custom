# A vertical page is the default form; slides are opt-in

Explanations of code and logic were often built as a deck: a fixed 1280x720 stage, one slide at a time, moved with the keyboard and the mouse. A review of a real session showed what that form costs the reader. A click on a checkbox label took the deck back a slide, because the stage owns the mouse. A live control opened a native drop-down over fixed-size cards. A long trace did not fit 720px. A deck also scales its stage to the window, so in a narrow window the text shrinks with it. And the reader had to learn the keys before reading the first claim.

None of the shared parts needed a stage. Themes, components, figures, the live model and the checks work on any page, and the worked example in `examples/band-score/` was already a vertical page. So the default form of the Freestyle route is now one vertical page: the verdict as the headline, one section per claim with its source under it, a section menu (`ui-nav`) when there are three or more sections, and a live model where the reader's own numbers matter. `templates/page.html` is the starting point.

Presentation stays as a route, for the reader who asks for slides or a talk. It is not the base of anything else, and the gate no longer reaches for it to explain something.

## Consequences

- A page reads on a phone, in print and with scripts off, and needs no navigation keys. The section menu replaces the slide counter.
- The Presentation files (template, `presentation.css`, workflow and tests) are kept, not deleted. Removing the route is a separate decision, to take if it goes unused.
- "Make it a presentation" still routes to Presentation. Only unspecified explainers move to the page form.
- A click on a label, a card or empty space never moves a page or a deck; links, the menu and keys do.
- Parts such as `ui-work`, `ui-range`, `ui-choice` and `ui-cases` are complete in their static form, so they work unchanged in both forms.

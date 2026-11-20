# Visual companion diagrams

How a reader explores a diagram on a companion screen: what the diagram is made of, how it is laid out, and how it highlights parts of itself.

## Language

**Diagram**:
An Explain block drawing a JSON graph as nodes and directed edges.
_Avoid_: Chart (a chart plots numbers), figure, picture

**Graph**:
The nodes and edges of a diagram, identified by stable IDs.
_Avoid_: Model, structure

**Node**:
One named box in a diagram, identified by a stable id.
_Avoid_: Box, block

**Edge**:
A directed line from one node to another.
_Avoid_: Arrow, connector, link

**Step focus**:
The nodes a named diagram step highlights while the rest dim.
_Avoid_: Spotlight, highlight step

**Highlight mode**:
The diagram's current state: idle or step focus.
_Avoid_: Diagram state

**Budget**:
The part count above which a diagram reports that it should be split.
_Avoid_: Limit, cap

## Routes and Explain pages

**Route**:
What the reader wants from a screen: Prototype, Explain, Presentation, or Freestyle. The route decides how the screen is built.
_Avoid_: Workflow, mode

**Reader load**:
The effort a reader spends to follow and understand a screen. The guiding principle of every route, stated once in `SKILL.md`.
_Avoid_: Cognitive load, readability

**Theme**:
A set of shadcn-named design tokens (colour, shape, fonts, scale) in `assets/ui/themes/`. Every route reads the same tokens, so a theme restyles Explain, Presentation and Freestyle alike.
_Avoid_: Skin, preset

**Prototype**:
A route that shows a proposed product page or compares UI directions, styled with the project's own CSS.
_Avoid_: Design, mockup

**Page**:
The default form of the Freestyle route: one vertical, scrolling document whose headline is the verdict, with one section per claim and a section menu when it has three or more sections. Built from `templates/page.html`.
_Avoid_: Report, article, deck (a deck is paged slides, a different form)

**Explain**:
A route that teaches how something works or proves where a value comes from, drawn from a lesson spec.
_Avoid_: Understand, investigate, walkthrough

**Lesson spec**:
The JSON an agent writes for one Explain page: a title, an answer and ordered sections of blocks.
_Avoid_: Page JSON, schema

**Block**:
One catalog entry placed in a section, such as a derivation, a quiz or a diagram.
_Avoid_: Component (a component is the code that draws a block), widget

**Step**:
One stage of a derivation: a formula, the formula with values substituted, and the result.
_Avoid_: Stop, row

**Input**:
A named value the reader can change; every step that depends on it recomputes.
_Avoid_: Parameter, variable

**Expect check**:
The comparison between a step's result at the starting inputs and the value the real code produced for the same inputs.
_Avoid_: Assertion, test

**Trace**:
A `ui-trace` block: the code, the data going in, then one step at a time with the data after it. Each output is printed by a real run (`scripts/trace.ts`), never typed. Optional, for a reader new to the domain's words.
_Avoid_: Walkthrough

**Replay**:
A `ui-replay` block: events in time order, one at a time on an axis of numbered ticks, each saying what happened and why. Built by `scripts/figures.ts replay`; see `references/motion.md`.
_Avoid_: Animation, scene player

**Figure**:
A picture that carries one claim: a table, a stepper, range bars, a grid of cells, or small multiples. Chosen by what the content is; see `references/figures.md`.
_Avoid_: Chart, graphic, visual

**Quality floor**:
The minimum legibility and access limits every page meets, based on WCAG 2.2 level AA. See `references/quality-floor.md`.
_Avoid_: Compliance, accessibility audit

**Worked calculation**:
A `ui-work` block: for each step the result, the formula, then the formula with the reader's numbers put in. The numbers come from a run or from a tested model, never from memory.
_Avoid_: Walkthrough, derivation (a derivation is the Explain block)

**Live model**:
The formula a page runs when the reader changes an input, kept in one file with no DOM and checked against the real code with `scripts/model-check.ts`.
_Avoid_: Simulation, calculator

# Freestyle

Use when the reader wants a visual that is none of the other three routes: an explainer, a review report, a map, a timeline, a poster, a toy. You choose the form. There is no spec and no required sections. Weigh everything below against reader load (`SKILL.md`); the two rules for five or more items of one shape are the exception, and they bind.

## The default form: a vertical page

One column the reader scrolls, with a section menu to jump. It reads on a phone, in print and with scripts off, and needs no keys to learn. Slides are for the Presentation route only.

Order, bent when the question asks:

1. **The verdict.** The headline is the answer as one sentence ("A 75 kW machine reading 74 % scores 67.8: warning"). Under it, one line that defines the words it uses.
2. **A menu** (`ui-nav`) from three sections up; leave it out below that.
3. **One section per claim that matters.** The title is the claim, a figure or live part carries it, and the source (path, line or command) sits under it. Items beyond the top few go in `<details>` rows (the ranking rule in `SKILL.md`).
4. **A live model** where the reader's own numbers matter: `live-model.md`.
5. **Evidence inline or last, never missing.** Numbers come from a run or from reading the source; mark anything inferred or illustrative on the element that relies on it.

Start from `templates/page.html` in `$HOME/.agents/skills/visual-companion`: the modern theme with its dark partner and a Theme button, the menu, the headline and three sections. Copy it, fill every `@@…@@`, delete what you do not need.

## Ideas

- **Form follows the question.** Decide what the reader must see in the first five seconds, then pick the shape: a table for comparison, a timeline for order, a graph for connection, a diagram for flow, a small interactive for "what if".
- **One idea, one page.** If two compete for the top, make two pages and publish them in order.
- **Draw what you describe.** A screenshot, or a `ui-mock`.
- **Cut until it hurts.** Remove any element the reader would not miss.
- **Pick the figure by the content** (`figures.md`). A choice among a few named values is a `ui-choice`, not a drop-down.
- **Move only what changes over time.** Events in order, each with a reason: `motion.md`.
- **Complete with scripts off.** The static form carries the whole answer; scripts add behaviour on top.

## Tools

All optional. Parts: `ui.ts list`, `ui.ts show <name>` (`shared-ui.md`).

- Keep your own CSS only when the question needs its own look, and say why: `<meta name="own-style" content="reason">`. Web fonts must fall back.
- Publish with `push <file.html>` (drop `--isolate` if it needs scripts) or `compare` for side-by-side static options. With no companion, run `bun scripts/inline-ui.ts in.html out.html` and hand over `out.html`.
- `ui.ts check <file.html>` warns on a full page that uses none of the shared layer and gives no `own-style` reason.
- `npx impeccable detect <file.html>` lists legibility and access findings; read `quality-floor.md`. Both are advisory.
- For a reader new to the domain's words, show code with real data going in and out: `plain-to-code.md`.
- Open the page at a wide and a narrow width and use every control. A cold read by a fresh agent finds what a reader cannot place.

## Hard limits

- Do not invent numbers.
- Meet the quality floor: contrast, text size, keyboard, headings in order, no sideways scroll at 320px (a wide diagram scrolls in its own box), colour never the only signal.
- A click on a label, a card or empty space never scrolls or moves the page; only links, the menu and keys do.
- Hand over the source HTML path, and say what you checked and what you did not.

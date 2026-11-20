# Plain first, then the real code

Use when the reader lacks the domain's words but can follow an example, and should end up understanding the code. Skip it for an expert reader.

## Three layers, each optional

1. **Plain.** An everyday picture, then one example with real values. Define each technical word at first use.
2. **Map.** A `ui-table` (see `shared-ui.md`): plain word, technical term, real code (`path:line`), plus one row for where the picture breaks.
3. **Code.** The real code run on the example's data: the `ui-trace` below. End on one technical sentence naming the real term.

Show layer 1, layers 1 and 2, or all three. With scripts off every layer is on the page.

## Rules

- **Real values, real output**, from running the code.
- **One step per meaningful action** (one method in a chain), not one per line.
- **Highlight only what changed** (`mark`); say in one plain sentence what the step did and why it matters.
- **Name the gotcha**: trace the step the reader would get wrong, such as a row dropped with its valid values or a blank skipped, not counted as 0.
- **Each step's output stands alone**: include the context needed, such as the score with its tone.
- **On a slide, the trace gets the whole slide.** It fits 720px at every step: keep each output to about 6 lines and the summary to two. Without JavaScript the slide grows taller.
- **Offer it, don't gate on it**, when the reader is not an expert or a term would stop them.

## Trace a run

`ui-trace` shows the code, the input data, then one step at a time with Back and Next, and a summary. `scripts/trace.ts` builds it from real command output:

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/trace.ts" spec.json block.html
```

The spec is JSON: `code`, `input` (`title`, `cmd`, optional `mark` list of texts), `steps` (each `title`, `code`, `plain`, `cmd`, optional `mark` list), optional `summary` and `timeoutSeconds`. Each `cmd` is a shell command run from the current directory, printing the data to show. For a project's own interpreter (a virtualenv, `uv run --with pandas`), put its absolute path in the `cmd`. Nothing is written if a command fails, prints nothing, or a `mark` matches no line. Example: [`examples/trace-dropna.json`](../examples/trace-dropna.json) with [`trace-dropna.py`](../examples/trace-dropna.py), `df.dropna().mean()` on three sensor readings, run from the skill directory. Headings are `h3`: place it under an `h2`.

Paste `block.html` into the page, link a theme, `components.css` and `ui.js`, then `ui.ts check` it: it warns on an `<output>` with no `data-ran`.

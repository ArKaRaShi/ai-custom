# CLI and Bilingual Review

The CLI builds the bilingual page from a Spec Kit `spec.md` without the agent writing the Thai. Run it from the skill directory: `bun scripts/cli.ts <command> [spec.md] [options]`.

## Commands

| Command | Does | Writes |
| --- | --- | --- |
| `check <spec>` | Lists items with no Thai line and Thai lines flagged for review. Exits 1 when any line is missing. | Nothing |
| `translate <spec>` | Translates only items whose English wording has no cached Thai line. Previews by default. | `thai.json`, only with `--apply` |
| `render <spec>` | Builds the review page. Refuses when any Thai line is missing. Previews by default. | `review.html`, only with `--apply` |
| `stages <stages.json>` | Builds one read-only page that keeps every stage. Previews by default. | `review.html` and, for newly approved stages, the pinned hash in `stages.json`, only with `--apply` |
| `setup` | Creates the Python environment and downloads the model. Previews by default. | Only with `--apply` |

## Options

| Option | Type | Notes |
| --- | --- | --- |
| `--apply` | boolean | Commits the change. Without it, `translate`, `render` and `setup` only preview. |
| `--verbose` | boolean | Prints every item. Without it, each group shows the first 15 and a hint. |
| `-h`, `--help` | boolean | Shows help before positional validation. Malformed or unknown options still fail. |
| `--format` | value: `tree` or `json` | Both `--format json` and `--format=json` work. JSON output has `status`, `tool` and `fingerprint`. Errors print `{"status":"error","error":...,"recovery":...}` and exit nonzero. |
| `--store`, `--extras`, `--out`, `--template` | value | Both forms work. A missing value fails with exit 2. `--store` and `--extras` apply to single-spec commands, not `stages`. |

Exit codes: 0 success, 1 failed operation or incomplete `check`, 2 usage error.

## Files per spec

All live in `<spec folder>/.visual-review/` unless an option overrides them:

- `thai.json`: `entries` are machine translations keyed by a hash of the exact English text. `overrides` are human corrections that a save leaves alone. They replace the machine line and skip the automatic check.
- `links.json` (optional): `{"FR-001": ["AC-01", "~AC-02"]}`. A `~` marks a partial match. These links are the reviewer's inference. Unknown ids fail the render. Without this file the page has no traceability matrix.
- `pre.html`, `post.html`, `entities.html` (optional): trusted review commentary shown before the stories, after the assumptions, and above the entity table. Start `pre.html` and `post.html` with an `<h2 data-title="..." data-th="...">`.
- `review.html`: the generated page. Copy or `--out` it into the visual companion's `screen_dir`.

## Thai rules

- The Thai line is a labelled translation. English is authoritative and `spec.md` is never edited.
- IDs and `MUST` / `MUST NOT` stay English. Names such as `Orca`, `Git`, `JSON`, `ai-sync` and numbers must appear in the Thai line.
- Keep `agent`, `manifest`, `remote`, and `backup` in English in the Thai line. `translate` prompts for this and rewrites common Thai forms to the English word. A line still missing a kept word is flagged.
- Automatic checks flag a line as `needs review` when it loses a negation or obligation, drops a kept name, number, or word, or lacks the Thai term for `preview` or `silently`. They also flag `silently` rendered as `โดยอัตโนมัติ` (automatically). A line that passes is not proven correct.
- To fix a flagged line, add the corrected text under `overrides` in `thai.json`. Later `translate` runs leave it alone.
- Editing one English line retranslates only that line. Entries for text that no longer exists are dropped on save.

## Page controls

Language: English, ไทย, or both (default both). Dark themes: graphite (default), midnight blue, slate and teal. Each stage is one scrolling page. Desktop has a sticky section sidebar that follows scrolling. Phones have a sticky "Jump to" selector. Deep links look like `#<stage>/<section-slug>`, such as `#plan/design-decisions`. `#<stage>` opens that stage from its top. An unknown hash doesn't switch stages; on first load the last stage with a source opens.

## Stages

`stages.json` lists the stages of one feature, in order. Paths are relative to the file.

```json
{
  "title": "ai-sync redesign",
  "stages": [
    { "id": "spec", "label": "Spec", "kind": "spec", "source": "spec.md", "approved": "2026-11-01" },
    { "id": "plan", "label": "Plan", "kind": "markdown", "source": "plan.md" }
  ]
}
```

- `kind: "spec"` uses the bilingual spec page. `kind: "markdown"` converts any markdown to blocks and shows English only.
- Set `approved` only after the user approves. The first render with `--apply` pins `approvedSha256`. A later render shows "changed after approval" on that stage and an out-of-date warning on every stage after it. The tool never re-pins.
- A missing source shows as "Not created yet". Earlier stages stay on the rail and open through "Show beside".
- `<source>.blocks.json` replaces the automatic conversion for Markdown stages only; `spec` stages ignore it. Shape: `{"title": "...", "sections": [{"title": "...", "blocks": [...]}]}`. Block types are `heading` (level 3 or 4), `text`, `list`, `table`, `code`, and `cards`. A bad file fails with the path of the first error.
- A section whose title has `approach`, `option`, or `alternative` shows its level-3 headings as side-by-side cards. The page does not mark a chosen approach, because the source text does not say.
- Text is escaped. Only `code`, **bold**, and link text are kept.

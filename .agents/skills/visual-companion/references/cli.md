# CLI

## Contents

`start`, `status / stop`, `push`, `explain`, `page`, `compare`, `states`, `stage`, `events`, Files on disk, Troubleshooting, Provenance.

Run these commands from any directory. Bun executes the TypeScript directly; there is nothing to install.

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" <command> [args] [--json]
```

`--json` (or `--format=json`) returns structured output for every command. Exit codes: `0` ok, `1` failure, `2` usage error.

Every command picks its session with `<session>`, which means either `--project-dir <repo>` or `--run-dir <dir>`. Use the same flag and value on every command in one session.

## start

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" start <session> [--open] [--port <n>] [--host <host>] [--idle-minutes <n>]
```

Starts the server detached and prints its URL. Idempotent: if one is already running for that session directory it returns the same URL instead of starting a second server. A stale restart reuses the session's saved key and attempts its saved port; if the port is unavailable, it picks a free port. The old tab reconnects only if the URL remains the same. With `--project-dir`, an explicit `stop` clears the active session; the next command creates a new session and its `start` returns a new URL. With `--run-dir` or a non-project directory, restarting uses the same session directory and saved key and attempts the saved port.

- `--open` launches the default browser.
- `--idle-minutes` (default 240) shuts the server down after that much inactivity.
- `--host 0.0.0.0` or `--host ::` binds beyond loopback. The printed URL uses local loopback; remote clients need the machine's reachable address instead.

JSON: `{pid, port, url, key, runDir, startedAt}`

## status / stop

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" status <session> --json
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" stop   <session>
```

`status` returns one of three explicit states: `{state:"running", info}` / `{state:"stale", info}` (a run file whose process is gone) / `{state:"stopped"}`. `start` replaces a stale file.

## push

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" push <file> [--title <text>] [--plain | --bundle] [--isolate] <session>
```

Publishes the file as the current screen and tells connected browsers to reload. The mode is detected from the content: a whole document is served as-is, a fragment is wrapped in the frame. `--plain` / `--bundle` override detection. Pushing also clears the previous screen's events.

JSON: `{screenId, file, title, mode, pushedAt, reloaded}`

`--isolate` renders a static screen in a sandboxed iframe with its own CSS. Scripts, interactive choices, and external resources are disabled. Each independently styled preview requires its own iframe; this option publishes one isolated screen.

## explain

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" explain <lesson.json> [--title <text>] <session>
```

Validates a lesson spec and publishes it as an Explain page. The spec is nested JSON: `title`, optional `subtitle`, `answer`, optional `inputs` and `functions`, and `sections`, each with an `id`, a `title` and a list of `blocks`. The full shape is in `explain/lesson.schema.json`. An invalid spec exits 1, names the section, block and field that failed, and publishes nothing. The title defaults to the lesson's title.

Derivations: `inputs` carry a starting value, a slider range and an optional mathjs unit (`km`, `MB/s`). `functions` are mathjs definitions such as `backoff(n) = min(30 s, 0.5 s * 2^n)`. Each Derivation step has an `expr` over inputs, functions and earlier step ids, and a `unit` whenever its result carries one. Before publishing, every step is evaluated at the starting inputs; an unknown name or a unit that does not convert fails the publish and names the step. A Playground sticks to the top while its own section scrolls, so put the Derivation it drives in the same section.
SVG illustrations use `{ "type": "Svg", "markup": "<svg ...>...</svg>" }`. Use inert drawing elements and theme colors such as `var(--primary)`; scripts, event handlers, external resources, styles and unsupported markup are rejected rather than silently removed.

Diagram blocks are plain JSON: `{ "type": "Diagram", "alt": "How a request is stored", "nodes": [{ "id": "api", "label": "API" }, { "id": "db", "label": "Database" }], "edges": [{ "id": "query", "source": "api", "target": "db", "label": "query" }], "direction": "LR", "steps": [{ "label": "Request", "focus": ["api", "db"] }] }`. `nodes` is required, `edges` may be empty, `direction` is `LR` (the default) or `TB`, and an edge `label` and the `steps` list are optional. Node ids must be unique among the nodes and edge ids among the edges; every edge `source` and `target` and every step `focus` entry must name an existing node, and a mismatch fails the publish at that field. Cycles, self loops and parallel edges are drawn as written. Select a node by click or keyboard; Escape clears selection. Picking a step highlights the nodes it focuses.

JSON: same as `push`, with `mode: "plain"`.

The renderer under `assets/explain/` is prebuilt and committed. After changing anything in `explain/`, rebuild it with `bun explain/build.ts`.

## page

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" page "Answer" /path/1.html "Steps" /path/2.html [--title <text>] <session>
```

Stacks named fragments into one scrolling page with a section index. Click a link or press keys 1–9 to navigate; a whole document is a usage error. Scripts and `data-choice` work as in `push`.

JSON: same as `push`, with `mode: "bundle"`.

## compare

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" compare "Option A" <a.html> "Option B" <b.html> <session>
```

Publishes separately sandboxed static previews. Scripts and choices are disabled; each preview provides its own styling. Stage local dependencies under `/files/`.

## states

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" states "Default" /path/default.html "Empty" /path/empty.html <session>
```

Publishes full-viewport static states in sandboxed iframes. Scripts, forms and choices are disabled; each preview provides its own styling. Use the rail, arrow keys or keys 1–9 to select a state. Keyboard events inside an iframe do not reach the parent.

JSON: same as `push`. Its `mode` is `plain` because it describes the generated rail page, not your files. To screenshot one state on its own, open `/files/states-<id>/<n>.html`, where `n` starts at 0. The rail page's iframe `src` attributes list these URLs.

## stage

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" stage <source-file> <relative-path> <session>
```

Copies one explicitly selected regular file into the active session's `files/`, available as `/files/<relative-path>`. Stage each dependency individually. Preserve stylesheet-relative paths where they resolve beneath `/files/`; rewrite root-relative URLs or paths that escape `/files/` to staged `/files/` paths. Existing files are not overwritten; dot paths and symlink destinations are rejected. Do not stage secrets.

## events

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" events             # recorded choices
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" events --wait 120  # wait for a choice
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" events --clear
```

`--wait` returns `[]` after the timeout instead of hanging. Each event looks like:

```json
{ "type": "choice", "choice": "b", "text": "Option B — sidebar", "channel": "ws", "at": 1762290000000 }
```

`channel` is `ws` for WebSocket messages, `http` for JSON POST requests, and `form` for form-encoded POST requests.

## Files on disk

Session directory is `<project>/.visual-companion/sessions/<session-id>/` (or `--run-dir`, or `$VISUAL_COMPANION_DIR`, else a temp dir per working directory):

```text
.visual-companion/
├── .gitignore  ignores everything in this directory
├── previews/       optional project-owned reusable screens
├── styles/         persistent project-owned reusable styles
├── active-session  ID reused until an explicit project stop
└── sessions/<session-id>/
    ├── content/    published screens
    ├── files/      explicitly staged assets served at /files/<name>
    └── state/      server info, key, port, current screen, events
```

With `--project-dir`, `start` creates or preserves `.visual-companion/.gitignore` and appends `*` when needed, ignoring all contents including previews and styles. It does not change the project root `.gitignore`. Git ignore rules do not affect files already tracked; remove those from the index separately if desired. Runtime screens stay on disk after `stop`. Older runtime directories are not migrated or deleted.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `Session key required` page | URL lost its `?key=`. Run `status --json` and use the `url` field. |
| Browser shows "Paused" overlay | Run `start` again. The tab reconnects only if the URL is unchanged; after an explicit project stop, open the new URL. |
| `server did not start` | Read `state/server.log`; the message includes its tail. Usually the port is held by something else — `stop`, then `start`. |
| `status` says `stale` | The process died without cleaning up. `start` overwrites the run file. |
| Choices never arrive | The tab is on an old URL after a port change, or nothing with `data-choice` was clicked. |

## Provenance

The companion's original concept comes from `obra/superpowers`. The server and browser client are a Bun rewrite. Explain's prebuilt renderer bundles the dependencies listed in `explain/package.json`; rebuild it after changing its source.

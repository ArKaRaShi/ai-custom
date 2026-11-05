# CLI

Run these commands from any directory. Bun executes the TypeScript directly; there is nothing to install.

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" <command> [args] [--json]
```

`--json` (or `--format=json`) returns structured output for every command. Exit codes: `0` ok, `1` failure, `2` usage error.

Every command except `components` picks its session with `<session>`, which means either `--project-dir <repo>` or `--run-dir <dir>`. Use the same flag and value on every command in one session.

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

## page

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" page "Answer" /path/1.html "Steps" /path/2.html [--title <text>] <session>
```

Stacks one or more name/file pairs into one long bundle page, in order. Each file must be a fragment. A whole document is a usage error. Each part becomes a numbered `<section id="vc-part-N">` with its name as a heading. A thin rail on the left edge, vertically centred, has one tick per part. Hover or focus a tick to see the part's name, click it or press keys 1–9 to scroll there. The tick for the part in view is longer and uses the accent color. Under 760px wide, the rail becomes a sticky strip of numbered names. Nothing is swapped or hidden, so the whole page scrolls and one full-page screenshot captures every part. Scripts and `data-choice` work as in `push`. Use `page` for explanations. Use `states` for product page states that each need a full viewport and their own CSS.

JSON: same as `push`, with `mode: "bundle"`.

## compare

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" compare "Option A" <a.html> "Option B" <b.html> <session>
```

Publishes two or more name/file pairs in separate sandboxed iframes. Previews are static and cannot report choices. A fragment gets the `vc-*` stylesheet inside its iframe, so bundle-mode components render. A whole document keeps only its own styles. Stage dependencies separately under `/files/`; relative links resolve from the generated comparison directory, so use explicit `/files/` URLs for preview assets.

## states

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" states "Default" /path/default.html "Empty" /path/empty.html <session>
```

Publish one or more name/file pairs as full-viewport static states. Each file is copied at publication time into a separate sandboxed iframe; scripts, forms, external resources, and choices inside previews are disabled. A fragment gets the `vc-*` stylesheet inside its iframe, so bundle-mode components render. A whole document keeps only its own styles. The companion renders the edge rail and mobile selector. Click a label, or use arrow keys on a focused rail tick to move focus and then Enter or Space to select it. Keys 1–9 select directly when focus is outside a preview iframe and not in an input or selector; the mobile selector also selects directly. Keyboard events inside an iframe do not reach the parent. Selectors overlay the preview rather than changing its layout. Use `/files/` URLs for staged dependencies. Republish after editing a file; there is no watcher. A failed input validation leaves the current screen unchanged.

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

## components

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" components         # compact list
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" components --json  # raw catalogue
```

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

The idea and the class vocabulary come from the visual companion in `obra/superpowers`. This implementation is a rewrite on Bun: no code is copied, and the browser assets, server, and client are original. No dependencies, no build step, no network calls.

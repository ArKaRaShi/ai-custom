# Authoring hooks

A hook is a cross-cutting check that fires on a tool call or on its result. One hook
has one job, one severity, and one place that names what it protects. The severity
ladder is the whole design: pick the lowest rung that stops the mistake.

| Category | Effect on the call | Use when | Message must contain |
| --- | --- | --- | --- |
| `advisory` | runs; adds a pointer | teaching before the first mistake | the absolute path of the standard |
| `warn` | runs; adds a caution | legal, but almost always wrong | the rule and the likely fix |
| `error` | blocked; a retry is expected | the input cannot succeed as written | `Fix:` and the exact replacement call |
| `block` | blocked; no automatic retry | data loss, secret exposure, unsafe action | the risk, and that a human decides |
| `sanitize` | runs; output replaced | secret or noise must not reach the model | what was masked, and that the file is unchanged |
| `observe` | runs; model sees nothing | sound, banner, metric | — |

## Placement follows the repo, not the home directory

A hook may be user-scoped or project-scoped; both obey this standard. Prefer project scope
for anything that names a repo path, a repo standard, or a language convention, because
that hook travels with the code and dies with the branch.

- omp: project `<cwd>/.omp/hooks/{pre,post}/*.{ts,js}`, user `<agentDir>/hooks/{pre,post}/*.{ts,js}`.
  A factory directly in `hooks/` is not discovered.
- claude-code: project `.claude/settings.json` (shareable) and `.claude/settings.local.json`,
  user `~/.claude/settings.json`, plus managed, plugin and skill scopes.

A standard that names only the user location is incomplete: it tells a reader to edit a file
the repo may never load.

## Resolve paths from the harness, never from the machine

Take the root from the event context: omp supplies `ctx.cwd`, claude-code supplies
`${CLAUDE_PROJECT_DIR}`. Fall back to `process.cwd()` only when the harness supplies neither.

- Never hardcode an absolute machine path, a home-directory layout, or a sibling directory
  name. `$HOME` belongs in user-scoped files a hook owns, never in a rule lookup.
- Resolve standards, config and script paths relative to that root.
- The hook must behave identically in a canonical checkout, any worktree, a fresh clone,
  and on another machine.

Wrong result: a hook that matches one absolute checkout path goes silent the moment that
checkout is cloned elsewhere, moved, or run as a worktree — and it reports success, because
silence looks like compliance.

Rules:

- A hook declares its identity, its category, the events it wires, and the standard it
  enforces. A declared event set that drifts from the registered handlers is a bug.
- Only the shared verdict builders may produce a blocking return. A hook that builds
  its own block shape has forked the standard.
- `advisory` and `warn` ride beside a result and are dropped when the call fails. A note
  that must survive failure belongs on the result event as well.
- Deduplicate: one note per session per key. A pointer repeated on every call becomes
  noise the model learns to skip.
- Never block to teach. If reading the message lets the agent retry correctly, the
  category is `error`; if a human has to decide, it is `block`.

## Adapter: omp

- Files live at user or project scope (see Placement); shared code lives in
  `hooks/shared/`, which discovery skips.
- Declare `export const HOOK_META` with `satisfies HookMeta` from
  `hooks/shared/verdict.ts` at user scope. A project hook cannot import it; declare a
  local `HOOK_META` literal with the same four fields and still return
  `{ additionalContext }` rather than a raw block.
- Build every return with `advisory`, `warn`, `error`, `block`, or `sanitized`.
  `error` and `block` accept only a category that permits blocking, so the type checker
  rejects a hook that oversteps the severity it declared.
- Dedupe with `sessionOnce()` and clear it with `resetOnSessionChange(pi, tracker)`.
- Project hooks are often gitignored, so the rule they enforce must be stated in a
  document that ships with the repo, not only in the hook's message.
- `tests/hooks/standard.test.ts` fails when a hook has no metadata, wires an event it
  did not declare, names a missing standard, or builds a raw blocking return.

## Enforced by

| Harness | Adapter | Category |
| --- | --- | --- |
| omp | ~/.omp/agent/hooks/pre/omp-hook-authoring.ts | ERROR |
| claude-code | — | — |

The omp adapter refuses a hook file with no metadata or with a hand-built block, and warns
once per file when a hook hardcodes an absolute machine path instead of resolving the root
from the harness. A dash means the standard is stated but nothing fails when an agent skips
it; replace the dash when an adapter lands.

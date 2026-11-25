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

- Files live in `~/.omp/agent/hooks/{pre,post}/*.ts`; shared code lives in
  `hooks/shared/`, which discovery skips.
- Declare `export const HOOK_META` with `satisfies HookMeta` from
  `hooks/shared/verdict.ts`.
- Build every return with `advisory`, `warn`, `error`, `block`, or `sanitized`.
  `error` and `block` accept only a category that permits blocking, so the type checker
  rejects a hook that oversteps the severity it declared.
- Dedupe with `sessionOnce()` and clear it with `resetOnSessionChange(pi, tracker)`.
- `tests/hooks/standard.test.ts` fails when a hook has no metadata, wires an event it
  did not declare, names a missing standard, or builds a raw blocking return.

## Enforced by

| Harness | Adapter | Category |
| --- | --- | --- |
| omp | — | — |
| claude-code | — | — |

A dash means the standard is stated but nothing in that harness fails when an agent
skips it. Replace the dash when an adapter lands.

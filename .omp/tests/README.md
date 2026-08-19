# Agent Tests

Tests mirror the source layout under `~/.omp/agent/`:

| Source | Test |
|---|---|
| `extensions/<name>.ts` | `tests/extensions/<name>.test.ts` |
| `hooks/<type>/<name>.ts` | `tests/hooks/<name>.test.ts` |
| `rules/<name>.md` | `tests/rules/<name>.test.ts` |

## Run

```bash
bun test ~/.omp/agent/tests          # full suite
bun test ~/.omp/agent/tests/rules    # rules only
bun test ~/.omp/agent/tests/rules/py-no-mutable-defaults.test.ts  # single rule
```

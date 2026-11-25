# Agent Tests

Tests mirror the source layout under `~/.omp/agent/`:

| Source | Test |
|---|---|
| `extensions/<name>.ts` | `tests/extensions/<name>.test.ts` |
| `hooks/<type>/<name>.ts` | `tests/hooks/<name>.test.ts` |
| `hooks/shared/<name>.ts` | `tests/hooks/<name>.test.ts` |
| `rules/<name>.md` | `tests/rules/<name>.test.ts` |
| `.agents/standards/<name>.md` | `tests/standards/index.test.ts` |
| `.agents/standards/<name>.md` shape | `tests/standards/shape.test.ts` |
| `hooks/shared/**` type contract | `tests/typecheck.test.ts` → `./typecheck.sh` |

`typecheck.sh` checks `hooks/shared` and the typecheck wrapper only. The hook adapters
under `hooks/pre` and `hooks/post` are not type-checked: the running omp is a native
binary and ships no type declarations. Their category, event, and standard contracts are
enforced at runtime by `tests/hooks/standard.test.ts`.

## Run

```bash
bun test ~/.omp/agent/tests          # full suite
bun test ~/.omp/agent/tests/rules    # rules only
bun test ~/.omp/agent/tests/rules/py-no-mutable-defaults.test.ts  # single rule
```

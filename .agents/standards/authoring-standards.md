# Authoring standards

Applies to every file under `.agents/standards`: it is the shape a standard must take so
each harness can find the rule, its adapter, and the missing adapter the same way.

## Template

```markdown
# <Topic the agent is working on>

<One sentence: what this applies to, and what it is about.>

## <The rule, one section per decision>

<The rule, the concrete command or example, and what a wrong result looks like.>

## Enforced by

| Harness | Adapter | Category |
| --- | --- | --- |
| omp | ~/.omp/agent/hooks/pre/image-work.ts | ADVISORY |
| claude-code | — | — |
```

## Shape

- Title first, then one scope sentence, then rule sections. No preamble above the title.
- Every table row names a harness; a dash in the adapter column is the honest signal that
  nothing fails when an agent skips the standard in that harness.
- An adapter path is absolute or `~/`-rooted, and it must exist.
- The category column uses the hook category names: ADVISORY, WARN, ERROR, BLOCK,
  SANITIZE, OBSERVE.
- Keep it under 150 lines. Two topics mean two files.

## Writing the rule

- State what is true of any harness; leave tool names to the adapter.
- Give one concrete command or example. A rule with no example is advice.
- Say what a wrong result looks like, not only what a right one looks like.
- Name the failure the rule prevents, in the evidence that produced it.

## Enforced by

| Harness | Adapter | Category |
| --- | --- | --- |
| omp | ~/.omp/agent/hooks/pre/standards-doc.ts | ERROR |
| claude-code | — | — |

The omp adapter refuses a write that breaks the shape, and warns after an edit leaves the
file broken. `tests/standards/shape.test.ts` runs the same checks over the whole folder.

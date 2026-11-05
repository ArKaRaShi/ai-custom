---
name: principle-make-operations-idempotent
description: Use when designing commands, lifecycle steps, Celery tasks, or processing loops that run amid crashes, restarts, and retries.
disable-model-invocation: true
---

# Make Operations Idempotent

**Principle:** Design each state-changing operation so it reaches the correct end state however many times it runs and wherever the previous run stopped.

**Why:** Workers, DAGs, and lifecycle steps run where crashes, restarts, and retries are normal. If partial state changes the next run's outcome, every restart becomes a debugging session.

## The Pattern

- Derive each step from the state that exists, not from what the previous run meant to do. Read current state, compare it to the goal, and apply only the difference. A repeat then finds nothing left to do.
- Make anything a run leaves behind recognizable as stale by the next run. This covers locks, temporary files, half-written records, and claimed jobs.
- Judge staleness by evidence that stays true wherever the previous run could have stopped, not only in the common case.
- Write to a temporary path and rename it into place. Compare artifacts by content, not by creation order.
- When a repeat is not safe by construction, add a reconciliation step that repairs leftover state before the work starts.

## Paired Example

```text
// Avoid: append and assume a clean start
insert row -> send message -> mark done   (crash after insert: retry inserts twice)

// Prefer: converge on the goal state
upsert row by natural key -> send message if not already sent -> mark done
```

Rationale: the second form gives the same end state on every retry.

## The Tests

- What happens if this runs twice in a row?
- What happens if the previous run crashed at every possible point?
- Does re-execution converge to the same end state?

If any answer is "it depends on what state was left behind", add a reconciliation step.

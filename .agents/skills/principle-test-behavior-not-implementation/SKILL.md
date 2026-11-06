---
name: principle-test-behavior-not-implementation
description: Use when you write, change, or keep a test. Assert what users of the code can observe.
disable-model-invocation: true
---

# Test Behavior, Not Implementation

**Principle:** A test is a claim about what the code does for its users: a caller, an end user, or another service. Behavior is what they observe through their interface: return values, errors, state read back, and effects on outside systems such as a request sent or a row written. Implementation is what they cannot observe: private helpers, internal call order, intermediate data, and which collaborator did the work.

**Why:** A test pinned to implementation breaks on every refactor and catches no bug. A test looser than the contract passes when the behavior breaks.

## The Pattern

Judge each test against two imagined edits.

- **Break the behavior.** Return a wrong value, skip an effect, or do it twice. If the test still passes, it proves nothing. Usual causes: an assertion looser than the contract, an expected value computed by the code under test, and an assertion on data the test built itself.
- **Change the internals.** Keep every observable result and restructure underneath. If the test fails, it is pinned to the implementation.

Keep a test that catches the first edit and survives the second. Rewrite or delete the rest.

- Drive the code through its users' interface with a concrete input.
- Derive the expected value from the requirement, not from a run of the code.
- Assert what the contract promises, no less and no more.
- A payload received by a mocked external service is behavior, because that service sees it. A call to an internal helper is not.
- Assert the error type callers branch on, not the exact message wording.
- Pair a "never happens" assertion with a case where it does happen, so the test shows it can see the call.
- A restated constant or prompt string that never runs the code that reads it proves nothing.
- An invariant is behavior: a key that must exist in two tables, or a compile-time type check.

## The Tests

- Does this test fail if the behavior breaks?
- Does it still pass if only the internals change?
- Did the expected value come from the requirement?

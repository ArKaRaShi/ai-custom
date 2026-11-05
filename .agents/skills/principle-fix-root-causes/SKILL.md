---
name: principle-fix-root-causes
description: Use when debugging. Trace each symptom to the first place the system went wrong and fix it there.
disable-model-invocation: true
---

# Fix Root Causes

**Principle:** Fix the fault, not the place where it surfaced. The symptom is where a wrong state became visible. The root cause is the first place the system did something it should not, or failed to handle a state it should handle.

**Why:** A symptom fix hides the evidence and lets the fault surface elsewhere. The code then carries a workaround for a bug nobody named.

## The Pattern

- Reproduce first.
- Ask "why" at each step until the answer is a wrong decision in the code, not a consequence of an earlier one.
- When stuck, instrument. Read the actual error and the actual state. Do not guess.
- Ask whether the state that triggered the symptom is legitimate. If the system may be in that state, the code that broke on it is the root cause, and handling the state there is the fix. If the state should never exist, a check where it broke hides the bug. Find what produced the state.
- Guards, retries, swallowed errors, clamped values, and discarded state are the usual ways to hide a bug.
- When something fails only after a restart, suspect persisted state first: config files, caches, lock files, serialized state.
- Search for the pattern, not only the instance. Fix every place with the same fault.
- A workaround that needs a paragraph-long comment to justify it means the code is wrong. Fix the code.
- If the deciding fact took a deep dig, propose a cheap, always-on signal that would show it at first look.

## The Tests

- Can I name the first wrong decision in the code?
- Is the state I now handle one the system may legitimately be in?
- Did I search for the same fault elsewhere?

---
name: principle-separate-before-serializing-shared-state
description: Concurrent shared state. Use when actors may write the same file, branch, key, or state object.
disable-model-invocation: true
---

# Separate Before Serializing Shared State

Eliminate shared mutable targets before choosing concurrency control.

## Rules

- Identify every shared mutable target, including files, branches, keys, and APIs that actors both define and consume.
- Ask whether the actors need one canonical object or publish independent facts. Give independent facts separate owned files, keys, branches, or state directories; combine them at the read or reporting boundary.
- If one shared write target is a real invariant, enforce serialization structurally with a lock, sequential phases, a single writer, or atomic compare-and-swap. Instructions and conventions alone do not prevent races.

## Example

Two workers updating separate fields in `state.json` still share a write target. Give them `indexer-state.json` and `metrics-state.json` and combine the results when reading.

## The tests

- Can each actor own a separate write target?
- If not, what structural mechanism prevents conflicting writes?

## Source

Adapted from [pstack](https://github.com/cursor/plugins/tree/main/pstack/skills/principle-separate-before-serializing-shared-state), copyright 2026 Lauren Tan, MIT licensed. See [LICENSE](LICENSE).

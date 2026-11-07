---
name: principle-encode-lessons-in-structure
description: Recurring corrections. Use when the same instruction or lesson must be repeated.
disable-model-invocation: true
---

# Encode Lessons in Structure

Make recurring lessons enforceable by the system rather than dependent on memory.

## Rules

- Identify the recurring failure and encode the invariant in the narrowest suitable mechanism: a lint, metadata flag, runtime check, or script.
- When structure enforces the lesson, remove the redundant instruction rather than maintaining both as separate sources of truth.
- When the lesson requires judgment and cannot be encoded, make the instruction prominent and illustrate the failure mode.

## Example

A repeated reminder to reject invalid configuration becomes a configuration validation check; a nuanced design judgment gets a prominent rule and a concrete counterexample.

## The tests

- Does the mechanism prevent or detect the recurring failure?
- If a human must still judge, is the instruction easy to find and illustrated?

## Source

Adapted from [pstack](https://github.com/cursor/plugins/tree/main/pstack/skills/principle-encode-lessons-in-structure), copyright 2026 Lauren Tan, MIT licensed. See [LICENSE](LICENSE).

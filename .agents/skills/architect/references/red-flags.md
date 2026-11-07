# Architecture red flags

Revise or reject candidates when callers must coordinate internal stages, public interfaces expose transport or storage details, or methods merely pass through arguments. Group behavior by ownership and domain knowledge instead of the order of execution.

Look for split state ownership, two ways to perform the same operation, importable internals and lists that must be updated in more than one place. Prefer one owner, one supported path, inaccessible internals and derived lists or checks that detect divergence.

A deep module hides substantial behavior behind a small interface; a long chain of forwarding layers does not make it deep.

Adapted from [pstack design red flags](https://github.com/cursor/plugins/blob/main/pstack/skills/architect/references/design-red-flags.md), MIT.

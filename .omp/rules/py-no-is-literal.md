---
description: Use == instead of is for literal value comparisons
globs:
  - "**/*.py"
condition:
  - '\bis[ \t]+(?:not[ \t]+)?(?:[rRbBuUfF]{0,2}[\x22\x27]|[+-]?(?:\d|\.\d)|[\[{])'
scope:
  - "tool:edit(*.py)"
  - "tool:write(*.py)"
interruptMode: never
---

`is` tests identity, `==` tests value. Python decides for itself whether two
matching literals share one object: since 3.8 the interpreter emits
`SyntaxWarning: "is" with 'int' literal`, and `x is 0` can be `True` on one build
and `False` on the next for the same value.

Use `==`/`!=` when either side is a literal or a runtime value (str, bytes,
number, list, dict, set, tuple). Keep `is`/`is not` for identity: `None`,
`True`/`False` when `1`/`0` must not count, sentinel objects, enum members, and
exact-type checks (`type(x) is int`). `is not []` is always `True` — the literal
builds a new list each time.

```python
if status is "success":    # avoid
if count is 0:             # avoid
if items is not []:        # avoid: always True

if status == "success":    # prefer
if count == 0:
if items != []:            # or `if items:` when only emptiness matters
if value is None:          # keep: identity with a singleton
if flag is True:           # keep: strict bool, excludes 1
```

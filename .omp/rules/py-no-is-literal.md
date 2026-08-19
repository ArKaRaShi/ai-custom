---
description: Use == instead of is for literal value comparisons
globs:
  - "**/*.py"
condition:
  - "\\bis\\s+"
  - "\\bis not\\s+"
scope:
  - "tool:edit(*.py)"
  - "tool:write(*.py)"
interruptMode: never
---

Use `==` and `!=` for comparing values against literals (such as strings,
integers, floats, lists, dicts). Use `is` and `is not` exclusively for identity
comparisons with `None` or known singleton sentinels.

```python
# Avoid: identity comparison with literal values
if status is "success":
    ...
if count is 0:
    ...
if items is not []:
    ...

# Prefer: equality comparison for values; identity only for None
if status == "success":
    ...
if count == 0:
    ...
if not items:
    ...
if value is None:
    ...
```

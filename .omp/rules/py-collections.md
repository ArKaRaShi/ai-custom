---
description: Choose Python collections by semantics
globs:
  - "**/*.py"
astCondition:
  - "set($$$)"
  - "dict($$$)"
scope:
  - "tool:edit(*.py)"
  - "tool:write(*.py)"
interruptMode: never
---

Small, static string-keyed lookup tables: typed `dict` literals such as
`LABELS: dict[str, str] = {...}`.

Use `set[T]` for dynamic membership or uniqueness. Use `dict[K, V]` for
dynamic key-to-value associations.

Use built-in generic syntax on Python 3.9+; otherwise follow the project's
supported annotation style.

```python
# Static lookup table → typed dict literal
LABELS: dict[str, str] = {
    "text": "Text",
    "json": "JSON",
}

# Dynamic membership → set
seen_ids: set[str] = set()
for item in items:
    if item.id in seen_ids:
        continue
    seen_ids.add(item.id)
```

Use a `list` for ordered sequences or duplicate values. Do not convert a list
to a set when order, duplicates, or unhashable values matter.

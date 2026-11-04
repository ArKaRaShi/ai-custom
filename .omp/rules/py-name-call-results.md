---
description: Name call results instead of nesting calls in arguments
globs:
  - "**/*.py"
condition:
  - '(?m)\b[A-Za-z_][A-Za-z0-9_]*\((?:(?!(?:lambda\b|f["'']))[^()])*\b(?!(?:str|int|float|bool|len)\b)[A-Za-z_][A-Za-z0-9_]*\('
scope:
  - "tool:edit(*.py)"
  - "tool:write(*.py)"
interruptMode: never
---

Never pass the result of a call as an argument of another call. Assign the result to a
variable first, one call per line.

Passing a function without calling it (`lambda`, named callback such as `map(str.strip, names)`)
is allowed. Type conversions and length checks as arguments (`str()`, `int()`, `float()`, `bool()`, `len()`)
are also allowed.

```python
# Avoid: the RMS call hides inside an argument list
return build_wr_view(live, fetch_latest_wr(project.equipment_id))
payload = json.dumps(serialize_review(review))

# Prefer: each result has a name and the effects read top to bottom
latest = fetch_latest_wr(project.equipment_id)
review_data = serialize_review(review)

return build_wr_view(live, latest)
payload = json.dumps(review_data)
```

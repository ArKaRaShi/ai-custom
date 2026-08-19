---
description: Avoid Python functions that add no behavior
globs:
  - "**/*.py"
condition:
  - '(?:async[ \t]+)?def[ \t]+[A-Za-z_][A-Za-z0-9_]*[ \t]*\([^)]*\)[ \t]*(?:->[^\n:]*)?:'
scope:
  - "tool:edit(*.py)"
  - "tool:write(*.py)"
interruptMode: never
---

Review one-expression functions and inline wrappers before keeping them.
Prefer the direct expression when the function only renames or forwards a
value. Keep the function when its name is a durable domain contract, it is a
public API, callback identity matters, it is a type guard, or it provides a
test seam or dependency-injection boundary.

```python
# Review: pure wrapper with no added behavior
def is_empty(value: str) -> bool:
    return len(value) == 0

# Inline when the name adds no durable meaning
if not value:
    ...

# Keep: durable domain concept
def is_retryable(error: Exception) -> bool:
    return isinstance(error, (TimeoutError, ConnectionError))
```

---
description: Ban mutable default arguments in Python function definitions
globs:
  - "**/*.py"
condition:
  - "=\\s*\\[\\s*\\]"
  - "=\\s*\\{\\s*\\}"
scope:
  - "tool:edit(*.py)"
  - "tool:write(*.py)"
interruptMode: never
---

Never use mutable default arguments (`[]` or `{}`). In Python, default
arguments are evaluated once when the function is defined, causing all calls
to share and mutate the same object across executions.

```python
# Avoid: shared mutable default
def process(items: list[str] = [], config: dict[str, str] = {}) -> None:
    items.append("new")

# Prefer: None sentinel and default assignment inside function
def process(items: list[str] | None = None, config: dict[str, str] | None = None) -> None:
    actual_items = items if items is not None else []
    actual_config = config if config is not None else {}
```

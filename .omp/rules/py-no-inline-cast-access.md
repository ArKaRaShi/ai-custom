---
description: Validate Python values before cast-based member access
globs:
  - "**/*.py"
condition:
  - '(?m)\b(?:typing\.)?cast[ \t]*\([^;\n]*\)[ \t]*(?:\.|\[)'
scope:
  - "tool:edit(*.py)"
  - "tool:write(*.py)"
interruptMode: never
---

Review inline `typing.cast` before member or item access. `cast()` changes
static typing only; it does not validate the value at runtime. Narrow an
in-process value with an actual check, or validate external data once at the
boundary and then use the validated type.

```python
from typing import cast

# Review: cast does not prove the mapping or key exists
content = cast(dict[str, object], value)["content"]

# Narrow before access
from collections.abc import Mapping

content: object | None = None
if isinstance(value, Mapping):
    content = value.get("content")
```

Keep a cast when the runtime invariant is already guaranteed and checking is
impossible or meaningless, but assign it to a named value and document why.

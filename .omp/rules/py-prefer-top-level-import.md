---
description: Prefer top-level imports; ask the user before adding a lazy import
globs:
  - "**/*.py"
condition:
  - "(?:^|\\n)[ \\t]+import\\s+\\w"
  - "(?:^|\\n)[ \\t]+from\\s+\\S+\\s+import\\s"
scope:
  - "tool:edit(*.py)"
  - "tool:write(*.py)"
interruptMode: never
---

Put imports at the top of the module. Do not add function-level (lazy) imports
on your own.

If you think a lazy import is needed, stop and ask the user before writing it.
State the file, the import, and which reason applies:

- Heavy dependency that slows startup, such as `torch` in a CLI.
- Optional dependency that may be missing at runtime.
- Breaking a circular import.

Write the lazy import only after the user approves. Then add a one-line comment
stating the reason.

Indented imports under `if TYPE_CHECKING:` or `try/except ImportError` at module
level are fine and need no approval.

```python
# Avoid: function-level import with no reason to defer
def load(raw: str) -> dict[str, str]:
    import json
    return json.loads(raw)

# Prefer: top-level import
import json

def load(raw: str) -> dict[str, str]:
    return json.loads(raw)

# Only after user approval: heavy dependency, reason stated
def embed(texts: list[str]):
    import torch  # heavy; only needed for this inference path
    ...
```

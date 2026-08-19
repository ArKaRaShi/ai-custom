---
description: Prefer pathlib.Path over os.path functions
globs:
  - "**/*.py"
condition:
  - 'os\.path\.join\('
  - 'os\.path\.exists\('
  - 'os\.path\.dirname\('
  - 'os\.path\.basename\('
scope:
  - "tool:edit(*.py)"
  - "tool:write(*.py)"
interruptMode: never
---

Prefer `pathlib.Path` over `os.path` functions. `pathlib` provides an
object-oriented interface for filesystem paths with cleaner composition and
consistent cross-platform handling.

```python
# Avoid: os.path procedural calls
import os

target = os.path.join(base_dir, "data", "file.txt")
if os.path.exists(target):
    parent = os.path.dirname(target)
    name = os.path.basename(target)

# Prefer: pathlib.Path
from pathlib import Path

target = Path(base_dir) / "data" / "file.txt"
if target.exists():
    parent = target.parent
    name = target.name
```

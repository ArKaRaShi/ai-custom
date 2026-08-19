---
description: Ban bare except or silent exception swallowing
globs:
  - "**/*.py"
condition:
  - 'except:\s*\n\s*pass'
  - 'except Exception:\s*\n\s*pass'
scope:
  - "tool:edit(*.py)"
  - "tool:write(*.py)"
interruptMode: never
---

Never use bare `except:` or silently swallow exceptions with `pass`. Silent
failure hides bugs, masks critical system errors (such as `KeyboardInterrupt`
or `MemoryError`), and makes debugging difficult. Catch specific exceptions
or log the error.

```python
# Avoid: bare except or silent swallowing
try:
    process_data()
except:
    pass

try:
    process_data()
except Exception:
    pass

# Prefer: catch specific exceptions or log
import logging

logger = logging.getLogger(__name__)

try:
    process_data()
except (ValueError, KeyError) as e:
    logger.exception("Failed to process data: %s", e)
    raise
```

---
description: Ban naive datetime generation (datetime.now() without tz, datetime.utcnow())
globs:
  - "**/*.py"
condition:
  - "datetime\\.(?:now\\(\\)|utcnow\\(\\))"
scope:
  - "tool:edit(*.py)"
  - "tool:write(*.py)"
interruptMode: always
---

Never generate naive datetimes using `datetime.now()` without arguments or
deprecated `datetime.utcnow()`.

Always generate timezone-aware UTC timestamps using `datetime.now(timezone.utc)`
(or `datetime.now(UTC)` in Python 3.11+).

Naive datetimes lack timezone context, produce comparison crashes (`TypeError:
can't compare offset-naive and offset-aware datetimes`), and introduce silent
data bugs across databases and distributed servers.

```python
# Avoid: naive datetimes or deprecated utcnow
from datetime import datetime

created_at = datetime.now()
created_at = datetime.utcnow()

# Prefer: timezone-aware UTC
from datetime import datetime, timezone

created_at = datetime.now(timezone.utc)

# Python 3.11+
from datetime import UTC, datetime

created_at = datetime.now(UTC)
```

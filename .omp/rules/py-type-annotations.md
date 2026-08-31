---
description: Enforce explicit type annotations on Python functions and data structures
globs:
  - "**/*.py"
scope:
  - "tool:edit(*.py)"
  - "tool:write(*.py)"
interruptMode: never
---

# Python Type Annotations

## Core Rules

1. **Annotate all function signatures**:
   - Every function and method must explicitly declare parameter types and return type (`-> ReturnType` / `-> None`).
   - Use built-in generic types (`list[T]`, `dict[K, V]`, `set[T]`, `tuple[T, ...]`).
   - Use union syntax (`T | None`, `A | B`) instead of `Optional` or `Union`.

2. **Data structures**:
   - Prefer structured typing (`dataclass`, `TypedDict`, `NamedTuple`, or `pydantic.BaseModel`) over untyped nested `dict`.

3. **Avoid over-annotating locals**:
   - Do not annotate obvious local variables (`count = 0`, `names = ["a"]`).
   - Annotate empty collections or ambiguous initializations (`results: list[str] = []`).

4. **When to propose types first**:
   - For new public interfaces, service boundaries, or multi-field data schemas: state the proposed signatures/types before writing the implementation.
   - For small bug fixes or internal helper updates: apply annotations directly without an extra confirmation roundtrip.

```python
# Bad
def fetch_users(query, limit=10):
    ...

# Good
def fetch_users(query: str, limit: int = 10) -> list[dict[str, Any]]:
    ...
```

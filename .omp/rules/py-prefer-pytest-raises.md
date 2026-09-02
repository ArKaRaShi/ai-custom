---
description: Prefer pytest.raises over manual try-except blocks for expected exceptions
globs:
  - "test_*.py"
  - "**/*_test.py"
  - "**/tests/**/*.py"
condition:
  - "pytest\\.fail\\("
scope:
  - "tool:edit(*.py)"
  - "tool:write(*.py)"
interruptMode: never
---

Prefer `with pytest.raises(ExpectedException):` context managers over manual
`try...except` blocks calling `pytest.fail()`.

`pytest.raises()` is the idiomatic pytest pattern: it cleanly captures the
exception, supports regex message matching (`match=...`), and maintains clear
tracebacks when an unexpected exception occurs.

```python
# Avoid: manual try-except boilerplate to test exceptions
def test_invalid_divisor():
    try:
        divide(10, 0)
        pytest.fail("Expected ZeroDivisionError was not raised")
    except ZeroDivisionError:
        pass

# Prefer: idiomatic pytest.raises
def test_invalid_divisor():
    with pytest.raises(ZeroDivisionError):
        divide(10, 0)

# Prefer: testing error message patterns
def test_negative_amount():
    with pytest.raises(ValueError, match="Amount must be positive"):
        transfer(amount=-50)
```

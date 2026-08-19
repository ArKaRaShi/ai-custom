---
description: Use Given/When/Then inline comments in Python test functions
globs:
  - "test_*.py"
  - "**/*_test.py"
  - "**/tests/**/*.py"
condition:
  - "def test_\\w+\\("
scope:
  - "tool:edit(*.py)"
  - "tool:write(*.py)"
interruptMode: never
---

All Python test function bodies MUST structure logic with `# Given`, `# When`,
and `# Then` section comments.

```python
# ✅ Correct: structured with Given / When / Then comments
def test_returns_401_for_expired_token():
    # Given an expired token and an authenticated client
    token = create_expired_token()
    client = APIClient(token=token)

    # When requesting the protected anomaly endpoint
    response = client.get("/api/v1/anomalies/")

    # Then it returns HTTP 401 Unauthorized
    assert response.status_code == 401
    assert response.json()["detail"] == "Token has expired"


def test_unmetered_provider_hides_statusline():
    # Given a model from an unmetered provider
    model = "openrouter/openai/gpt-5.6-luna:batch"

    # When sparkline is built
    sparkline = buildProviderSparklineString("openrouter", mock_usage)

    # Then output is empty string
    assert sparkline == ""
```

```python
# ❌ Avoid: flat test bodies without phase markers
def test_returns_401():
    token = create_expired_token()
    response = client.get("/api/v1/anomalies/", headers={"Auth": token})
    assert response.status_code == 401
```

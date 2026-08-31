---
description: Use given/when/then inline comments in Python test functions
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

All Python test function bodies MUST structure logic with `# given`, `# when`,
and `# then` section comments.

```python
# ✅ Correct: structured with given / when / then comments
def test_returns_401_for_expired_token():
    # given an expired token and an authenticated client
    token = create_expired_token()
    client = APIClient(token=[REDACTED:hook])

    # when requesting the protected anomaly endpoint
    response = client.get("/api/v1/anomalies/")

    # then it returns HTTP 401 Unauthorized
    assert response.status_code == 401
    assert response.json()["detail"] == "Token has expired"


def test_unmetered_provider_hides_statusline():
    # given a model from an unmetered provider
    model = "openrouter/openai/gpt-5.6-luna:batch"

    # when sparkline is built
    sparkline = buildProviderSparklineString("openrouter", mock_usage)

    # then output is empty string
    assert sparkline == ""
```

```python
# ❌ Avoid: flat test bodies without phase markers
def test_returns_401():
    token = create_expired_token()
    response = client.get("/api/v1/anomalies/", headers={"Auth": [REDACTED:hook])
    assert response.status_code == 401
```

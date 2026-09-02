---
description: Prefer async/await over Promise method chains (.then, .catch, .finally)
globs:
  - "**/*.ts"
  - "**/*.tsx"
condition:
  - "\\.(?:then|catch|finally)\\s*\\("
scope:
  - "tool:edit(*.ts)"
  - "tool:edit(*.tsx)"
  - "tool:write(*.ts)"
  - "tool:write(*.tsx)"
interruptMode: always
---

Prefer `async`/`await` with structured `try`/`catch`/`finally` blocks over raw
Promise chains (`.then()`, `.catch()`, `.finally()`).

Linear async/await flow produces clearer stack traces, simplifies control flow
(early returns, loops), and prevents unhandled promise rejection leaks.

```typescript
// Avoid: Promise chaining and nested callbacks
fetchUser(id)
  .then((user) => saveSession(user))
  .catch((err) => handleError(err))
  .finally(() => cleanup());

// Prefer: async/await with try/catch
try {
  const user = await fetchUser(id);
  await saveSession(user);
} catch (err) {
  handleError(err);
} finally {
  cleanup();
}

// Prefer: concurrent awaits over chained Promise combinators
const [user, preferences] = await Promise.all([
  fetchUser(id),
  fetchPreferences(id),
]);
```

Allow `.then()` or `.catch()` only when:
1. Handling un-awaited, fire-and-forget background operations (`task().catch(logger.error)`).
2. Fluent third-party query builders or middleware pipelines where `.then()` is part of the library API.

---
name: principle-migrate-callers-then-delete-legacy-apis
description: Use when introducing a new internal API while old callers still exist. Migrate callers and delete the old API in the same change.
disable-model-invocation: true
---

# Migrate Callers Then Delete Legacy APIs

**Principle:** Move every caller to the new API and delete the old one in the same change. Do not keep a compatibility layer.

**Why:** A kept shim leaves two paths to maintain, and callers drift back to the old one.

## The Pattern

- List every caller of the old API first, using the language server's references or a search.
- Migrate all of them, then delete the old API, its aliases, re-exports, and comments about it.
- Update tests to assert the new contract. Delete tests that only protect pre-refactor implementation details.
- Verify by searching for the old name: it must find nothing.

## When this applies

- No external users depend on backward compatibility.
- The project can absorb a coordinated breaking change.
- The new API comes from a simplification or refactor.

When external consumers exist, keep the old API and say why.

## The Tests

- Does a search for the old name find nothing?
- Did the tests move to the new contract?
- Are there external consumers I cannot migrate?

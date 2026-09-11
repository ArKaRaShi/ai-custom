# Django Fixture Loading

Django fixture loading validates model labels and database constraints at import time. Preflight must catch the same classes of failure before applying data.

## Required Checks

- Check serialized model labels against the installed Django apps.
- Check each non-null foreign-key value in the target or staged bundle.
- Filter supplements by the selected closure IDs.
- Pass sanitized fixture files to `loaddata`.
- Repeated imports have explicit identity and replacement behavior.
- Large time-series files use the declared natural key rather than an unavailable physical `id`.

## Nullable References

If a referenced table is intentionally excluded, the adapter must declare one policy:

- export the referenced rows as a supplement, or
- set the nullable reference to `NULL` in the staged fixture before loading.

Never leave dangling foreign keys and never mutate only an in-memory representation while loading a different file.

## Import Boundary

Use the adapter's transaction boundary around metadata loading and any custom time-series upserts. A failed constraint check must roll back the target mutation and preserve the bundle for diagnosis.

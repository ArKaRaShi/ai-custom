# Python/Django Adapter

Use the project's virtual environment for the adapter, such as `.venv-app/bin/python`.

## Adapter Shape

Keep project-specific scope and model rules in the repository adapter:

```text
jupyter/closures/<scope>.py
```

The adapter should:

1. Discover the repository root before importing settings.
2. Set the intended environment and Django settings module explicitly.
3. Initialize Django once for each command.
4. Query source data with a read-only connection or transaction.
5. Export base records and all declared supplements into one bundle.
6. Write `manifest.json` after computing all file hashes and row counts.
7. Run preflight before any target mutation.
8. Apply metadata and time-series data inside the target transaction policy.
9. Verify consumer-visible counts and natural-key uniqueness.

## Runtime Example

```bash
bun "$SKILL_DIR/scripts/closure.ts" preflight \
  --adapter-runtime .venv-app/bin/python \
  --adapter jupyter/closures/example.py \
  --bundle "$TMPDIR/data-closure" \
  --target local_database
```

Do not place production hosts, credentials, or project model lists in this reference.

# Django/MySQL Closure Guidance

Keep Django/MySQL identity and physical constraint handling in the adapter.

## Identity Conflicts

Before applying a fixture, compare:

- Django-declared primary key
- physical auto-increment key
- unique database columns
- logical replacement key used by the application

If those differ, the adapter must explicitly remove or update conflicting target rows inside the same transaction as the import. Never rely on `loaddata` to infer a logical replacement key.

## Large Data

For large natural-key data:

- export deterministic chunks
- record every chunk in the manifest
- stream hashes instead of loading entire files into memory
- order records by the declared natural key
- verify total rows and distinct natural keys after import

## Scope

Keep every supplemental query constrained by the root closure. An `OR` condition that admits rows from outside the active scope can create foreign-key failures and silently broaden the transfer.

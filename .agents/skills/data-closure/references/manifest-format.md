# Closure Manifest Format

The manifest is the stable interface between the generic Bun orchestrator and a framework adapter.

## Schema

```json
{
  "schema_version": 1,
  "run_id": "example-2026-09-11",
  "source": "production",
  "files": [
    {
      "path": "base/projects.json",
      "kind": "base",
      "model": "example.project",
      "rows": 12,
      "sha256": "64-lowercase-hex-characters"
    },
    {
      "path": "supplements/assets.json",
      "kind": "supplement",
      "model": "example.asset",
      "rows": 4,
      "sha256": "64-lowercase-hex-characters"
    }
  ],
  "natural_keys": [["sensor_id", "datetime"]]
}
```

## Required Fields

| Field | Rule |
| --- | --- |
| `schema_version` | Must be `1` |
| `run_id` | Non-empty run identifier |
| `source` | Non-empty source label; never a credential |
| `files` | Non-empty array of data files |
| `files[].path` | Relative regular file path contained by the bundle |
| `files[].kind` | `base` or `supplement` |
| `files[].rows` | Non-negative safe integer |
| `files[].sha256` | Lowercase SHA-256 digest of the exact file bytes |
| `natural_keys` | Optional array of non-empty arrays containing non-empty field-name strings |

The orchestrator recomputes every file hash before each guarded lifecycle operation. A mismatch fails the operation.
Resolve manifest paths with realpath containment. Reject files or parent directories that escape the bundle through symlinks.

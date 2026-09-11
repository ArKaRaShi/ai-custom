# Adapter Contract

The orchestrator is runtime-agnostic. An adapter is an executable that runs the closure lifecycle for one framework and project.

## Commands

| Command | Required behavior |
| --- | --- |
| `plan --output <plan.json>` | Report scope and dependencies, prove source read-only access, and write the safety plan without mutation |
| `export --output <bundle> --plan <plan.json>` | Write all base and supplement files plus `manifest.json` into a new bundle |
| `preflight --bundle <bundle> --target <target>` | Check target compatibility, model registration, FK closure, identity conflicts, and import policy without mutation |
| `apply --bundle <bundle> --target <target>` | Apply the bundle using the adapter's atomic or transactional mechanism |
| `verify --bundle <bundle> --target <target>` | Verify consumer-visible counts, references, natural keys, and preservation requirements |
| `prepare-manual --output <directory>` | Write reviewable user-execution artifacts and `manual-manifest.json`; never execute them |

Commands return exit code `0` only when the operation completed successfully. Any non-zero exit preserves the bundle and blocks later lifecycle state.
The orchestrator binds preflight, apply, and verify to the exact target host/database fingerprint.

## Runtime Invocation

The orchestrator receives an explicit runtime and adapter path:

```text
runtime adapter command flags...
```

Examples:

```text
.venv-app/bin/python jupyter/closures/example.py preflight ...
bun scripts/closures/example.ts preflight ...
```

Use argument arrays rather than a shell command string.

## Safety Plan

The plan must contain:

```json
{
  "schema_version": 1,
  "source": {
    "access": "read_only",
    "host_class": "production"
  }
}
```

The Bun orchestrator rejects any plan that omits `source.access: "read_only"`.

## Manual Artifacts

`manual-manifest.json` declares the artifact kind and runtime. It must set `agent_must_not_execute` and `user_executes` to `true`. The generic orchestrator checks the manifest and file paths, then stops.

## Adapter Responsibilities

The adapter owns:

- source and target connection setup
- root-scope queries
- recursive or declared dependency closure
- framework serialization and loading
- FK, natural-key, and identity rules
- nullable-reference policy
- transaction boundaries
- domain-specific verification

The adapter must not delete source data or silently broaden the requested scope.

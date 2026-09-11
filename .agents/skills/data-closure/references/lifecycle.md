# Data Closure Lifecycle

A closure run stages one transfer. The adapter exports base and supplemental files into one bundle. The orchestrator checks the bundle before it applies the data and verifies the result before cleanup.

## States

| State | Meaning | Allowed next state |
| --- | --- | --- |
| Planned | Adapter has described scope and dependencies | Exported |
| Exported | New bundle and manifest exist | Preflighted |
| Preflighted | Manifest and target checks passed | Applied or preflighted again |
| Applied | Adapter completed the target mutation | Verified |
| Verified | Adapter confirmed the target contract | Cleaned |
| Cleaned | Temporary bundle no longer exists | Terminal |

When the manifest changes, preflight and verification state become stale. Failed operations preserve the bundle for diagnosis.

## Modes

`auto` runs the adapter lifecycle. `manual` prepares reviewable artifacts and stops before execution. The adapter chooses the artifact format, such as a notebook, script, SQL file, or runbook.

## Safety

The source plan must prove read-only access. Local targets use loopback hosts. Remote, staging, production, and unknown targets require user confirmation plus an exact `<host>/<database>` target fingerprint.

## Bundle Rules

- Create a new bundle path for every run.
- Keep `manifest.json` at the bundle root.
- Store base and supplement files below the bundle.
- Record every data file in the manifest.
- Never store credentials or permanent production exports in the skill package.

## Cleanup Gate

The verified marker also records the exact target fingerprint used by preflight, apply, and verify.
Cleanup requires a verification marker whose manifest digest matches the current manifest. This prevents deleting a bundle after its contents changed or after verification covered a different target.

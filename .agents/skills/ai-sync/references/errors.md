# Errors and results

`--format=json` prints `{operation, scope, actions, outcome, errors, recovery}` plus `git`, `items`, or `drift` when relevant. `git.manifestDiff` shows manifest changes a Git step exports or finds pending. `outcome` is `preview`, `success`, `partial`, or `failed`. Failures exit nonzero. Each action is `proposed`, `completed`, `failed`, or `not_attempted`.

| Code | Meaning |
| --- | --- |
| `EMPTY_SCOPE`, `BROAD_SCOPE`, `UNKNOWN_TARGET` | target selection is empty, unbounded for `--apply`, or unknown |
| `PLAN_INVALID`, `PLAN_STALE_SCOPE`, `PLAN_STALE_POLICY`, `PLAN_STALE_SOURCE`, `PLAN_STALE_TARGET` | the plan is malformed or no longer matches current state |
| `PATH_ESCAPE`, `SYMLINK_UNSUPPORTED` | a path leaves its root, or a symlink would be followed |
| `GIT_DIRTY_UNRELATED`, `GIT_REMOTE_ADVANCED`, `GIT_CONFLICT` | Git state blocks the step; a pending `.ai-sync/manifest.json` edit blocks a push and is named in the message |
| `GIT_UNSUPPORTED_CONFIG`, `GIT_SIMULATION_FAILED`, `GIT_FAILED` | Git cannot be simulated or the command failed |
| `IO_FAILED` | a file operation failed |

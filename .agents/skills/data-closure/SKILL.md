---
name: data-closure
description: Use when copying a scoped dataset between databases and the transfer requires dependency closure, supplemental exports, manifests, atomic application, verification, or safe cleanup
---

# Data Closure

Use this skill for scoped database transfers such as production-to-local snapshots, branch data copies, or temporary fixture bundles.

The skill is framework-agnostic:

- Bun scripts orchestrate staging, manifests, subprocesses, lifecycle state, and cleanup.
- A project adapter owns framework and domain behavior.
- The manifest is the stable boundary between the orchestrator and adapter.

Do not use this for a full database clone. Use `db-sandbox` instead.

## Modes

Choose a mode explicitly:

| Mode | Agent behavior | Database execution |
| --- | --- | --- |
| `auto` | Runs the complete adapter lifecycle | Agent executes it |
| `manual` | Prepares reviewable execution artifacts | User executes them |

If the user did not choose a mode, do not execute a database operation. Ask which mode they want.

### Auto

Auto mode runs:

```text
plan -> source safety -> export -> target safety -> preflight
     -> apply -> verify -> cleanup
```

Use it only after the user explicitly selects `auto`.

```bash
SKILL_DIR="${SKILL_DIR:-$HOME/.agents/skills/data-closure}"

bun "$SKILL_DIR/scripts/closure.ts" run \
  --mode auto \
  --adapter-runtime <runtime> \
  --adapter <adapter> \
  --output <bundle> \
  --target <database> \
  --target-host <host>
```

### Manual

Manual mode prepares artifacts and stops. The adapter chooses the artifact format:

- notebook
- script
- SQL
- runbook
- another reviewable runtime artifact

The agent performs static validation only. It must not execute the generated artifact.

```bash
bun "$SKILL_DIR/scripts/closure.ts" prepare \
  --mode manual \
  --adapter-runtime <runtime> \
  --adapter <adapter> \
  --output <artifact-directory>
```

The output must contain `manual-manifest.json` with `agent_must_not_execute: true` and `user_executes: true`.

## Reference Routing

During a transfer, load only references relevant to the selected adapter:

| Adapter | References |
| --- | --- |
| Python/Django | `references/python/django/adapter.md`, then the relevant loading and database references |
| Other stack | Load stack-specific references only when the adapter needs them |

The generic orchestrator can run without stack-specific references. It must not assume Python, Django, Jupyter, or any other runtime.

When creating or updating references, follow `references/reference-convention.md`.

Auto mode permits the agent to execute the adapter lifecycle. Manual mode permits artifact preparation only. The agent never executes the generated artifact.

## Runtime Boundary

Run generic orchestration with Bun:

```bash
SKILL_DIR="${SKILL_DIR:-$HOME/.agents/skills/data-closure}"
bun "$SKILL_DIR/scripts/closure.ts" <command> ...
```

Run the project adapter with its declared runtime:

```text
<runtime> <adapter> <command> <flags>
```

Examples include `.venv-app/bin/python` for a Python adapter and `bun` for a TypeScript adapter. The Bun scripts use explicit argument arrays and never shell-interpolate adapter commands.

## Required Adapter Commands

```text
plan --output <plan.json>
export --output <bundle> --plan <plan.json>
preflight --bundle <bundle> --target <target>
apply --bundle <bundle> --target <target>
verify --bundle <bundle> --target <target>
prepare-manual --output <artifact-directory>
```

The adapter writes one bundle manifest covering base files, supplements, row counts, hashes, dependencies, and natural keys. Keep base data and supplements in that bundle. Do not manage them as unrelated dump directories.

## Safety Gates

- The source plan must declare `source.access: "read_only"`.
- Production or other source databases use read-only credentials or a read-only transaction.
- The target database and target host must be explicit.
- `localhost`, `127.0.0.1`, and `::1` are local targets.
- Remote, staging, production, and unknown targets require user confirmation through `ask`.
- Dangerous target commands also require `--confirm-target <host>/<database>`.
- The CLI verifies only the exact fingerprint. The agent must call `ask` and receive approval before passing it.
- Lifecycle markers bind preflight, apply, and verify to the exact `<target-host>/<target>` fingerprint.
- Resolve every manifest and manual artifact path inside its bundle or output directory. Reject symlinks that escape these roots.
- Check each manifest file and SHA-256 before preflight, apply, verify, and cleanup.
- Refuse to overwrite an existing bundle or manual artifact directory.
- Keep failed bundles for diagnosis.
- Delete temporary JSON only after verification succeeds for the same bundle and target.

## Common Mistakes

| Mistake | Correction |
| --- | --- |
| Discovering a missing FK after import | Declare the related data as a supplement during `plan` |
| Importing base and supplement directories independently | Stage one bundle with one manifest |
| Running auto mode without explicit selection | Ask the user to choose `auto` or `manual` |
| Treating a database name as proof of locality | Inspect the target host |
| Claiming source safety without a plan record | Require `source.access: "read_only"` |
| Executing a manual artifact as a convenience | Stop after static validation |
| Applying after the bundle changed | Run `preflight` again; stale lifecycle state blocks `apply` |
| Deleting data after import without verification | Run `verify`, then `cleanup` |

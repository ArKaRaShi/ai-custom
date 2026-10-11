# Dependency Contract

Document and isolate external package dependencies for authored skills. Keep skills self-contained and protect host environments.

## The Four-Part Dependency Contract

Every authored skill that requires external packages must include `references/dependencies.md` (or a section in `SKILL.md`) with four sections:

1. **Runtime Requirements**: document baseline engine and binary versions (such as `bun >= 1.1`, `node >= 18`, or `python >= 3.11`).
2. **Declared Packages and Justification**: list each declared package with an explicit rationale explaining why external code is necessary rather than standard libraries or inline helpers.
3. **Deterministic Installation**: provide copyable, directory-scoped installation commands covering the primary package manager and standard fallbacks.
4. **Observable Failure Recovery**: document expected runtime error signatures (such as `Cannot find package '<name>'` or `ModuleNotFoundError`) and the exact command to resolve them.

Verification-only tools follow this contract too. Declare supported versions and justify each tool. Document reproducible setup and missing-tool recovery while keeping dependencies isolated. Keep applicable `lockfiles` and leave dependency directories `untracked`. Prefer existing tooling. A documentation-only skill does not need a package manifest solely to expose a check command. See the [verification contract](verification.md).

## Multi-Manager Detection Hierarchy

Skills and automated tooling must support diverse package managers across user workstations. Select or suggest package managers using a two-tier hierarchy:

### Tier 1: `Lockfile` Affinity

When a `lockfile` exists at the skill root, use the corresponding package manager to ensure reproducible dependency trees:

| Ecosystem | `Lockfile` | Preferred Command |
| :--- | :--- | :--- |
| **Node / Bun** | `bun.lock` | `bun install` |
| **Node / Bun** | `pnpm-lock.yaml` | `pnpm install` |
| **Node / Bun** | `package-lock.json` | `npm install` |
| **Node / Bun** | `yarn.lock` | `yarn install` |
| **Python** | `uv.lock` | `uv sync` |
| **Python** | `poetry.lock` | `poetry install` |

### Tier 2: Binary Availability Fallback

When no `lockfile` exists, detect available binaries on the host `PATH`:

- **JavaScript / TypeScript**: check in order: `bun` -> `pnpm` -> `npm`.
- **Python**: check in order: `uv` -> `poetry` -> `python3 -m venv` + `pip`.

Document commands for the recommended runner and standard alternatives:

```bash
# Recommended (if Bun installed)
bun install

# Alternative (pnpm)
pnpm install

# Standard fallback (Node.js npm)
npm install
```

## Diagnostic Message Contract

Entry-point scripts must avoid unhandled engine stack traces when a declared package is missing. Catch module resolution failures and emit structured diagnostics:

1. State the missing dependency.
2. Provide the recommended installation command matching the active runtime.
3. Display the exact skill directory where the command must run.

```text
✖ Missing required dependency 'ignore'.
  To install dependencies for this skill:
  cd <skills-root>/<skill-name> && (bun install || pnpm install || npm install)
```

## Safe-by-default Installation

External package managers execute lifecycle hooks and remote code during installation.

- **No Silent Installation:** automated tools (bootstrap scripts, agents, harness commands) must not run install commands without user awareness.
- **Explicit Confirmation:** tools must preview missing packages and require an explicit flag (such as `--apply` or `--install`) or interactive user approval before running installation commands on the host machine.

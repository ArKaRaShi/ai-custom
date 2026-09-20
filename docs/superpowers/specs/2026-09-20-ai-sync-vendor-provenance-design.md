# ai-sync: Vendor Provenance for Non-Skill Categories

## Problem

`ai-sync` has an `origin`/`sync` provenance manifest for the `skills` category only
(`skills-manifest.json`: `authored | external`, `sync: boolean`). Every other synced
category (`extensions/`, `agents/`, `rules/`, `hooks/`, `tests/`) is treated as one
opaque directory: every file inside is synced identically, whether the user wrote it
or the host application (Orca) installed it.

This already caused real drift: `extensions/orca-agent-status.ts`, `orca-prefill.ts`,
and `orca-titlebar-spinner.ts` each carry an `// @orca-managed-pi-extension` marker
comment (app-managed, not user-authored) but are committed to the `ai-custom` backup
repo. Every Orca update touches these files, so `ai-sync status`/`push` reports false
"Modified" drift, and a prior session already had to hand-fix this once (git log:
`chore(config): update smol/fallback models and sync orca extensions`).

Goal: vendor-managed files must never be tracked in the `ai-custom` git backup —
they belong to the local machine, refreshed by the app itself, not to the user's
custom-content repo.

## Non-Goals

- No changes to the skills ecosystem features (GitHub source tracking, `skills-lock.json`
  integration, version pinning) — those stay exactly as they are.
- No new sync target categories. `extensions/agents/rules/hooks/tests` already exist
  in `TARGET_MAP`; this only adds provenance awareness on top of them.
- No automatic deletion of anything. All classification is report-first,
  write-on-confirmation.

## Vocabulary

One `Origin` type used everywhere in the tool: `"authored" | "vendor"`.

Skills' existing `"external"` value is renamed to `"vendor"` (no backward-compat
constraint) — it is the same concept as extensions' vendor marker: *not authored
by me, comes from somewhere else*. `skills-manifest.json`'s existing `"external"`
entries are migrated to `"vendor"` as part of this change.

## Architecture

Two separate mechanisms sharing one vocabulary:

```
skills/          → existing manifest system, unchanged mechanics,
                    renamed vocabulary (authored | vendor)

extensions/      → NEW: single combined vendor-manifest.json
agents/            keyed by "<category>/<filename>"
rules/             auto-detected via marker regex by default,
hooks/             `mark`/`unmark` CLI only for overrides
tests/             (identical mechanism — no special-casing)
```

**Why one combined manifest for the five non-skill categories, not one per category
and not folded into `skills-manifest.json`:** these categories only ever need
`authored`/`vendor` + an optional detection reason — no ecosystem metadata (source,
version, install command) the way skills need. Unlike skills, which live entirely
under one root (`SKILLS_DIR`), these five categories each live under a *different*
root (`~/.omp/agent/extensions`, `~/.omp/agent/agents`, etc.), so there is no single
natural "inside" location for a manifest the way `skills-manifest.json` sits inside
`SKILLS_DIR`. A combined file solves this without inventing five near-empty files.

**Location:** `~/.omp/agent/vendor-manifest.json` ↔
`~/Disk/ai-custom/.omp/vendor-manifest.json`, registered as its own new
`TARGET_MAP` entry (category: `vendor-manifest`) so a `mark` decision made on one
machine reaches every other machine through the normal `push`/`pull` flow.

## Data Model

```ts
type Origin = "authored" | "vendor"; // used everywhere, including skills going forward

interface VendorManifestEntry {
  origin: Origin;
  sync: boolean;
  detectionReason?: string;
}

interface VendorManifest {
  version: number;
  entries: Record<string, VendorManifestEntry>; // key: "<category>/<filename>"
}
```

Example key: `"extensions/orca-agent-status.ts"`.

## Detection Precedence

Highest wins, evaluated per file:

1. **Explicit entry in `vendor-manifest.json`** (set via `mark`) — always wins, and
   survives the marker text ever changing or disappearing in a future Orca release.
2. **Vendor-marker regex match** in file content (`@orca-managed-pi-extension`;
   extensible list for future app-specific markers) → `origin: "vendor"`,
   `sync: false`.
3. **Default** → `origin: "authored"`, `sync: true` (today's behavior, unchanged
   for any file nobody has run `discover`/`mark` against).

## Invariant: vendor is always non-syncing

`vendor` origin is hard-locked to `sync: false` — not just a default, a structural
constraint. `mark <category> <file> vendor --sync` is rejected with a validation
error. This is intentional and non-negotiable: the whole point of this feature is
that app-managed files can never reach the `ai-custom` git backup, regardless of
flags passed.

`authored` origin defaults to `sync: true` but accepts `--no-sync` for
authored-but-private files, mirroring skills' existing `authored` default.

## CLI Surface

| Verb | Scope | Behavior |
|---|---|---|
| `track <skill> <authored\|vendor> [--sync\|--no-sync] [--from ...] [--version ...]` | skills only | Unchanged mechanics, renamed vocabulary (`external` → `vendor`). |
| `untrack <skill>` | skills only | Unchanged. |
| `discover [--write]` | skills **and** extensions/agents/rules/hooks/tests | Extended to scan all five non-skill categories alongside the existing skills report. Prints `category/file → detected origin → reason` for every file. Without `--write`, report-only (the audit step). With `--write`, persists current detections into `vendor-manifest.json` as explicit entries. |
| `mark <category> <file> <authored\|vendor> [--sync\|--no-sync, authored only]` | extensions/agents/rules/hooks/tests | Manual override for one file. `vendor --sync` is a validation error (see invariant above). |
| `unmark <category> <file>` | same | Removes an override; falls back to auto-detection. No-op with a message if no override existed. |

**Audit workflow:** run `discover` any time (especially right after this ships, and
after any Orca update) → review the printed table → `--write` to confirm, or
`mark`/`unmark` individual files that were misclassified before confirming.

## Wiring into Existing Sync Flow

`sync-files.ts`'s three call sites (`cmdStatus`, `cmdPull`, `cmdPush`) currently call
`withOriginFilter(opts, manifest)` to exclude `sync: false` skills. Add a second,
composed filter: `withVendorOriginFilter(withOriginFilter(opts, manifest))`, which
excludes `sync: false` entries from `vendor-manifest.json` the same way, for the
five non-skill categories. `matchesPattern`'s existing filename-matching logic
requires no changes.

## Migration (one-time rollout step, not ongoing maintenance)

1. `git rm --cached` the 3 already-tracked `orca-*.ts` files from `ai-custom`
   (`orca-agent-status.ts`, `orca-prefill.ts`, `orca-titlebar-spinner.ts`) — keep
   them on disk locally, they're the live app-managed copies.
2. Run `discover --write` once to seed `vendor-manifest.json` with the 3 detected
   entries, pinning them as `vendor` even if a future Orca release strips the
   marker comment.
3. Migrate `skills-manifest.json`'s existing `"external"` values to `"vendor"`.

## Error Handling

- `mark <category> <file> ...` where `file` doesn't exist under that category's
  local root → error, no manifest write.
- `mark ... vendor --sync` → validation error (structural invariant, see above).
- Corrupt/unparseable `vendor-manifest.json` → same fallback as skills'
  `loadManifest`: treat as empty, never crash the CLI.
- `unmark` on a file with no override → no-op, prints "no override existed."

## Testing

Mirrors the existing `ai-sync` suite style (`bun:test`):

- Marker-detection precedence (manifest override beats regex beats default).
- `mark` validation rejecting `vendor --sync`.
- `discover` report-only vs `--write` persistence.
- Regression test: `compare()` excludes `vendor-manifest.json`-listed `sync: false`
  entries from `missingInRepo`, for each of the five non-skill categories.
- Skills vocabulary migration: existing `"external"` entries load and behave
  identically after being renamed to `"vendor"`.

---
name: git-pr
description: Use when drafting, revising, or reviewing a pull request title or description from a diff, branch, issue, or existing PR; when asked for a PR body, PR summary, or PR update. Do not use for commit-message-only requests.
---

# Git PR

Draft accurate, repo-aware pull request titles and descriptions. Proportional to the diff: short and focused for small fixes, modular and operational for multi-subsystem or infrastructure changes.

## Core Rules

1. **Local rules win.** Read repository instructions, PR templates, and documented conventions before applying these defaults.
2. **Ground every claim.** Inspect the relevant diff, commits, issue/spec, and existing PR body when available. Never invent issue IDs, test results, commit SHAs, URLs, reviewers, motivations, or speculative reviewer concerns.
3. **Separate why from what.** Put motivation in `## Summary`; put implementation details in `## What's included` or concise bullets beneath the summary.
4. **Proportional shape.** A 20-line bug fix needs only a few bullets. A large architectural PR needs subsystem groupings and operational runbooks.
5. **Use real links only.** A source link needs a known repository remote, path, and commit SHA. Do not use branch names as permanent permalinks or emit placeholder URLs.
6. **Related PR links.** Put related PRs in a final section at the bottom of the body. Use one raw GitHub/GitLab PR URL as a bullet (`- https://github.com/owner/repo/pull/123`).
7. **Preserve existing signal.** When revising an existing PR, read its current body first. Preserve meaningful motivation, screenshots/images, checklists, reviewer notes, and links unless the user explicitly asks to remove them.
8. **Report testing truthfully.** Include commands actually run and their outcomes. Do not turn planned or unrun checks into passing results.
9. **Avoid local leakage.** Use repository-relative paths. Do not include absolute machine paths, credentials, private URLs, or confidential names.
10. **No side effects by default.** Drafting returns text only in a markdown code block. Run `gh` or another PR API only when the user explicitly asks to create or update a PR.
11. **Always assign the user.** When creating or updating PRs via `gh` or API upon explicit request, always add the current user as an assignee (`--add-assignee "@me"` or `--assignee "@me"` on creation). Do not overwrite or remove existing assignees; preserve them and append the user.

---

## Universal Base Structure (Every PR)

Every PR description MUST have:

- **Title:** Imperative, concise, consistent with conventional commits: `type(scope): summary` (lowercase, ≤72 chars, no trailing period).
- **`## Summary`:** 1–3 sentences stating the problem/motivation (*why*) and the net observable outcome (*what*).

---

## Scope-Adaptive `## What's included`

- **Small / Single-Focus PRs:** A flat bullet list (2–5 items max) stating what was added or changed.
- **Large / Multi-Subsystem PRs:** Group by subsystem or functional theme using `### Area / Component` headings, with concise action bullets underneath. Focus on functional capabilities, not raw file listings.

---

## Conditional Operational Sections (Include ONLY when present in diff)

> **Rule:** Never emit empty or placeholder sections. Only include an operational section if the diff genuinely touches that boundary.

### `## Migrations & deployment steps`
* **Trigger:** Touches database schemas, migrations (`migrations/`, Alembic, Prisma, Flyway, SQL), drops tables/columns, or adds operational commands.
* **Content:**
  - Call out destructive vs additive changes explicitly.
  - Document required deploy-time or manual backfill commands (with `--dry-run` or flags if available).

### `## Configuration`
* **Trigger:** Adds or modifies environment variables, settings (`settings.*`, `.env*`, config structs, YAML/TOML/JSON configs, helm charts).
* **Content:**
  - Code block listing the new environment variables or config keys.
  - State safe rollout defaults (e.g. `FEATURE_ENABLED=0`) and the operational reason.

### `## Performance`
* **Trigger:** Query optimization, caching, latency improvements, or performance-critical algorithm refactors.
* **Content:**
  - Before vs. after benchmark/latency table.
  - Optional `<details><summary>Measurement method</summary>` block explaining the test conditions.

### `## Breaking changes / Deprecations`
* **Trigger:** Removals of public APIs, changes to endpoint request/response contracts, altered CLI flags, or backward incompatibility.
* **Content:**
  - Clear migration instructions for callers or downstream clients.

### `## Testing`
* **Trigger:** When tests or verification steps were executed.
* **Content:**
  - Exact command(s) run and actual pass/fail counts.
  - Linting or typecheck status if verified.

### `## Related PRs`
* **Trigger:** Cross-repo dependencies, frontend-vs-backend PRs, or prerequisite PRs exist.
* **Content:**
  - Bullet list of raw PR URLs (`- https://github.com/org/repo/pull/123`).

---

## Common Mistakes

- Emitting empty headings when the diff does not touch that area (e.g. including `## Migrations` when no DB changes exist).
- Listing raw file diffs instead of functional capabilities under `## What's included`.
- Fabricating benchmark numbers or calling unrun test suites "passing".
- Deleting existing screenshots, reviewer notes, or checklists when editing an existing PR.
- Running `gh pr create` or `git push` without explicit user instruction.

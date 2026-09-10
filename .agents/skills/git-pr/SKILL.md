---
name: git-pr
description: Use when drafting, revising, or reviewing a pull request title or description from a diff, branch, issue, or existing PR; when asked for a PR body, PR summary, or PR update. Do not use for commit-message-only requests.
---

# Git PR

Draft accurate, repo-aware pull request titles and descriptions. Scale with the diff: short and focused for small fixes, modular and operational for multi-subsystem or infrastructure changes.

## Core Rules

1. **Local rules win.** Read repository instructions, PR templates, and documented conventions before applying these defaults.
2. **Ground every claim on net diff against base.** Always inspect the effective 3-dot diff (`<base>...HEAD`), not session memory, unstaged diff alone, or commit-by-commit churn. Never invent issue IDs, test results, commit SHAs, URLs, reviewers, motivations, or speculative reviewer concerns.
3. **Separate why from what.** Put motivation in `## Summary`. Put code changes in `## What's included` or concise bullets beneath the summary.
4. **Proportional shape.** A 20-line bug fix needs only a few bullets. A large architectural PR needs subsystem groupings and operational runbooks.
5. **Use real links only.** A source link needs a known repository remote, path, and commit SHA. Do not use branch names as permanent permalinks or emit placeholder URLs.
6. **Related PR links.** Put related PRs in a final section at the bottom of the body. Use one raw GitHub/GitLab PR URL as a bullet (`- https://github.com/owner/repo/pull/123`).
7. **Preserve existing signal.** When revising an existing PR, read its current body first. Keep user motivation, screenshots, checklists, reviewer notes, and links unless the user explicitly asks to remove them.
8. **Report testing truthfully.** Include commands actually run and their outcomes. Do not turn planned or unrun checks into passing results.
9. **Avoid local leakage.** Use repository-relative paths. Do not include absolute machine paths, credentials, private URLs, or confidential names.
10. **No side effects by default.** Drafting returns text only in a markdown code block. Run `gh` or another PR API only when the user explicitly asks to create or update a PR.
11. **Assignee handling.** When creating or updating PRs via `gh` or API upon explicit request, add the current user as an assignee (`--add-assignee "@me"` or `--assignee "@me"` on creation). Do not remove existing assignees; append the user instead.

## Effective Diff & Base Branch Resolution (REQUIRED FLOW)

A pull request represents **only the net diff merged into the base branch (`<base>...HEAD`)**, not session history or experimental branch commits.

### 1. Resolve Target Base Branch

Determine the base branch to compare against:

1. Explicit branch specified by the user (e.g. `release/v2`, `develop`).
2. Existing PR target branch (`gh pr view --json baseRefName -q .baseRefName`).
3. Default repository integration branch (`origin/develop`, `origin/main`, `develop`, `main`).

**Ambiguity gate:** when competing base branches exist (such as `main` alongside `develop`), prompt the user to pick the target branch before drafting.

### 2. Inspect Net 3-Dot Diff

Inspect the net changes between the base merge-base and the branch tip:

```bash
git diff $(git merge-base <base> HEAD) HEAD
# or: git diff <base>...HEAD
```

And inspect net commits:

```bash
git log --oneline $(git merge-base <base> HEAD)..HEAD
```

Do not rely on session memory or uncommitted working-tree edits alone. The 3-dot diff is the ground truth for what this branch actually introduces.

### 3. Filter Branch-Internal Churn

- **Scratchpad additions and deletions:** when a commit introduces and later deletes a file, helper, or dependency within this branch (net diff = 0), omit it entirely.
- **Internal refactors:** when earlier commits in this branch add code and later commits refactor it, describe only the final state as an addition or change against `<base>`. Never say "Refactored X to Y" if X never existed in `<base>`.
- **Internal bug fixes:** when you fix a bug or typo introduced earlier in this unmerged branch, do not list it as a bugfix. Describe the working feature in its final state as a new capability.

---

## Universal Base Structure (Every PR)

Every PR description MUST have:

- **Title:** imperative, concise, consistent with conventional commits: `type(scope): summary` (lowercase, under 72 characters).
- **`## Summary`:** 1 to 3 sentences stating the motivation (*why*) and the net observable outcome (*what*).

---

## Scope-Adaptive `## What's included`

- **Small / Single-Focus PRs:** a flat bullet list (2 to 5 items max) stating the added or changed behavior.
- **Large / Multi-Subsystem PRs:** group by subsystem or functional theme using `### Area / Component` headings, with concise action bullets underneath. Focus on functional capabilities, not raw file listings.

---

## Conditional Operational Sections (Include ONLY when present in diff)

> **Rule:** never emit empty or placeholder sections. Only include an operational section if the diff touches that boundary.

### `## Migrations & deployment steps`

- **Trigger:** touches database schemas, migrations (`migrations/`, Alembic, Prisma, Flyway, SQL), drops tables/columns, or adds operational commands.
- **Content:**
  - Call out destructive vs additive changes explicitly.
  - Document required deploy-time or manual backfill commands (with `--dry-run` or flags if available).

### `## Configuration`

- **Trigger:** adds or modifies environment variables, settings (`settings.*`, `.env*`, config structs, YAML/TOML/JSON configs, helm charts).
- **Content:**
  - Code block listing the new environment variables or config keys.
  - State safe rollout defaults (e.g. `FEATURE_ENABLED=0`) and the operational reason.

### `## Performance`

- **Trigger:** query optimization, caching, latency improvements, or performance-critical algorithm refactors.
- **Content:**
  - Before vs after benchmark/latency table.
  - Optional `<details><summary>Measurement method</summary>` block explaining the test conditions.

### `## Breaking changes / Deprecations`

- **Trigger:** breaking changes in public APIs or endpoint contracts.
- **Content:**
  - Clear migration instructions for callers or downstream clients.

### `## Testing`

- **Trigger:** when tests or verification steps ran.
- **Content:**
  - Exact command(s) run and actual pass/fail counts.
  - Linting or typecheck status if verified.

### `## Related PRs`

- **Trigger:** cross-repo dependencies, frontend-vs-backend PRs, or prerequisite PRs exist.
- **Content:**
  - Bullet list of raw PR URLs (`- https://github.com/org/repo/pull/123`).

---

## Common Mistakes

- Emitting empty headings when the diff does not touch that area (e.g. including `## Migrations` when no DB changes exist).
- Listing raw file diffs instead of functional capabilities under `## What's included`.
- Fabricating benchmark numbers or calling unrun test suites "passing".
- Deleting existing screenshots, reviewer notes, or checklists when editing an existing PR.
- Running `gh pr create` or `git push` without explicit user instruction.
- Describing branch-internal churn (e.g. "Refactored X", "Fixed bug in new helper", "Removed temporary file") when X was never in the base branch.
- Drafting without verifying the base branch or running `git diff <base>...HEAD`.

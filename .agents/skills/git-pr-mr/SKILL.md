---
name: git-pr-mr
description: Use when drafting, revising, or reviewing a GitHub pull request or GitLab merge request title or description from a branch, diff, issue, or existing PR or MR. Do not use for commit messages.
disable-model-invocation: true
---

# Git PR and MR

Draft accurate, repository-aware pull request (PR) and merge request (MR) descriptions. Repository instructions and templates take precedence.

## Workflow

1. Identify the host and inspect its repository instructions, template, and conventions. For an existing request, read its current description and preserve motivation, screenshots, checklists, reviewer notes, and links unless explicitly asked to remove them. See [platforms](references/platforms.md).
2. Resolve the base using the user's explicit target first. Otherwise use the existing request's target, followed by the repository's integration branch. Ask if competing targets remain ambiguous. Inspect `git diff <base>...HEAD` and `git log --oneline $(git merge-base <base> HEAD)..HEAD`. Describe only the net diff and omit branch-internal churn.
3. Draft proportionately. Use an imperative conventional title under 72 characters and a summary of one to three sentences explaining why and what. When prose alone leaves the change unclear, add the smallest visual under the summary: pseudocode, a call tree, a file tree, or a diff-style sketch of only what changes. Group changes for larger work. Respect a request to revise only the description without changing the title. Apply [conditional sections](references/sections.md) only when relevant.
4. Ground claims in the diff or observed evidence. Never invent motivations, links, issue IDs, commit SHAs, reviewers, benchmarks, or test results. Report commands actually run and their outcomes. Distinguish unverified work. Use repository-relative paths and omit credentials, private URLs, confidential names, and workstation-only fixture operations. Use permanent source links only with a known remote, path, and commit SHA.
5. Return draft text in a Markdown code block. Do not create or update a request unless explicitly asked. Never push without explicit permission. When explicitly creating or updating, add the current user as assignee without removing existing assignees. Follow [platforms](references/platforms.md).
6. **REQUIRE SUBSKILL:** `markdown-quality`: run `bun ~/.agents/skills/markdown-quality/scripts/review.ts <body-path> --mode=human` before presenting or submitting. Save the body as `<name>.pr.md` so the PR-text rules apply. If unavailable, inspect headings and links manually without stalling.

## Verification

From the skills root, verify the frontmatter name matches `git-pr-mr`, all local links resolve, and the layout contains only permitted files. With Bun and markdown-quality installed, run `bun ~/.agents/skills/markdown-quality/scripts/review.ts git-pr-mr --mode=agent`. Correct failures. Exercise one GitHub PR and one GitLab MR drafting scenario with existing bodies and different target branches. Verify the correct target and preservation of existing content, and confirm no mutations occur. Record results and any unverified limits. This skill contains no executable content.

Examples: [illustrative PR and MR structures](examples/sample-pr-mr.md). Adapt them to the actual change rather than following a fixed template.

# Platform guidance

Identify the host from the request and repository remote. If ambiguous, ask rather than assuming GitHub.

## GitHub

Inspect repository PR templates and the current PR body. Get an existing PR target with `gh pr view --json baseRefName -q .baseRefName`. When explicitly asked to create or update a PR, use GitHub's relevant tools. Append the current user with `--add-assignee @me` for an update or `--assignee @me` for creation. Preserve other assignees.

## GitLab

Inspect applicable project templates in `.gitlab/merge_request_templates/` and any accessible inherited or project-configured template. Read the existing MR and its target branch with `glab mr view`, or the GitLab API. Do not guess JSON fields. Use the actual self-managed host when applicable. When explicitly asked to create or update an MR, identify the authenticated username from the relevant GitLab instance. Do not assume `@me` works as a CLI argument. `glab mr create --assignee <username>` assigns on creation. `glab mr update --assignee +<username>` adds without replacing existing assignees. Preserve existing assignees, report permission or tier limitations, and never push without separate explicit permission.

Related requests belong in a final section with real, known GitHub PR or GitLab MR URLs. Never fabricate or rewrite a URL to resemble another host.

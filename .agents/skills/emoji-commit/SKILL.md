---
name: emoji-commit
description: >
  Use when generating, drafting, or writing git commit messages with emoji or unicode symbols and bulleted change lists, or when asked for conventional commits with emoji and bullet points.
---

Write commit messages terse and exact in Conventional Commits format with a mandatory emoji or unicode symbol in the subject line and a mandatory bulleted body. No fluff. Why over what.

## Format Contract

Every commit message MUST strictly follow this structure:

```
<type>(<scope>): <emoji|unicode> <summary>

- <bullet point 1>
- <bullet point 2>
- <bullet point 3>
```

- `<scope>` is optional: `<type>: <emoji|unicode> <summary>`
- Empty blank line between subject and body is REQUIRED.
- Body is ALWAYS present as a list of bullet points (`- `).

## Rules

### Subject line:
- `<type>(<scope>): <emoji|unicode> <summary>`
- Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`, `style`, `revert`
- Must include an emoji or unicode character directly after the colon (with a space)
- Imperative mood: "add", "fix", "remove" — never "added", "adds", "adding"
- ≤50 chars when possible, hard cap 72
- No trailing period

### Common Type-to-Icon Mapping:
| Type | Emoji | Unicode Alt | Purpose |
|---|---|---|---|
| `feat` | ✨ | ✦ | New feature or capability |
| `fix` | 🐛 | ✖ | Bug fix |
| `refactor` | ♻️ | ↺ | Code restructuring without behavior change |
| `perf` | ⚡ | ⚡ | Performance optimization |
| `docs` | 📝 | ✎ | Documentation updates |
| `test` | 🧪 | ✓ | Adding or modifying tests |
| `chore` | 🔧 | ⚙ | Tooling, dependencies, routine tasks |
| `ci` | 🤖 | ⚑ | CI/CD pipelines and automation |
| `build` | 📦 | ▤ | Build system, packaging |
| `style` | 🎨 | ❖ | Code style, formatting, whitespace |
| `revert` | ⏪ | ↶ | Reverting previous changes |

### Body (ALWAYS REQUIRED):
- NEVER omit the body. Even for trivial changes, provide at least 1-3 bullets.
- ALWAYS use hyphen bullets (`- `), never asterisks (`*`) or prose paragraphs.
- Keep bullets concise and high-signal: explain *why* and key architectural/behavioral points.
- Wrap lines at 72 chars.
- Reference issues or PRs at the end as bullets or trailers:
  - `- Closes #42`

### What NEVER goes in:
- Prose paragraphs in the body (body must be strictly bullet points)
- Subject line without an emoji or unicode symbol
- "This commit does X", "I", "we", "now", "currently" — the diff already shows the code
- AI attribution trailers ("Generated with Claude Code", etc.) unless explicitly required by user
- Redundant restatements of file names already in the scope

## Examples

### Feature with scope:
```
feat(auth): ✨ add JWT refresh token rotation

- Store refresh token hash with family ID in session store
- Invalidate entire token family on detected replay attack
- Expose /api/auth/refresh endpoint for client silent renew
- Closes #45
```

### Bug fix without scope:
```
fix: 🐛 handle null pointer in tenant header resolution

- Fallback to default tenant when x-tenant-id header is omitted
- Return 400 Bad Request when tenant identifier is malformed
- Add regression test for missing header on healthcheck route
```

### Refactoring:
```
refactor(database): ♻️ migrate query builder to kysely

- Replace raw SQL concatenation with type-safe query builders
- Consolidate connection pooling settings in database config
- Reduce boilerplate across repository layers
```

## Boundaries

Only generates the commit message. Does not run `git commit`, does not stage files, does not amend. Output the message in a markdown code block ready to paste.

---
name: git-emoji-commit
description: >
  Use when generating, drafting, or writing git commit messages with emoji or unicode symbols and adaptive body formatting (prose or capped bullets), or when asked for emoji commit messages.
---

Write commit messages terse and exact in Conventional Commits format with a mandatory emoji or unicode symbol in the subject line, and an adaptive body that explains the root cause.

## Format Contract

Every subject line MUST strictly follow:

```
<type>(<scope>): <emoji|unicode> <summary>
```

- `<scope>` is optional: `<type>: <emoji|unicode> <summary>`
- Place a space between emoji and summary.
- Use imperative mood: "add", "fix", "remove" (not "added", "adds", "adding").
- Keep under 50 characters when possible, with a hard cap of 72 characters.

### Type-to-Icon Mapping

| Type | Emoji | Unicode Alt | Purpose |
| --- | --- | --- | --- |
| `feat` | ✨ | ✦ | New feature or capability |
| `fix` | 🐛 | ✖ | Bug fix |
| `refactor` | ♻️ | ↺ | Code restructuring without behavior change |
| `perf` | ⚡ | ⚡ | Performance optimization |
| `docs` | 📝 | ✎ | Documentation updates |
| `test` | 🧪 | ✓ | Adding or modifying tests |
| `chore` | 🔧 | ⚙ | Tooling, dependencies, routine maintenance |
| `ci` | 🤖 | ⚑ | CI/CD pipelines and automation |
| `build` | 📦 | ▤ | Build system, packaging, external deps |
| `style` | 🎨 | ❖ | Code style, formatting, whitespace |
| `revert` | ⏪ | ↶ | Reverting previous changes |

---

## Adaptive Body Rules

Choose one mode based on diff complexity:

### Mode 0: Zero Body (Subject-Only)

- **When to use:** atomic, trivial, or self-explanatory changes (e.g. routine version bumps, typo fixes, small formatting tweaks).
- **Rule:** do not write a redundant body or bullet that merely repeats the subject line.

```
chore(deps): 📦 bump next from 15.5.9 to 15.5.25
```

### Mode 1: Description / Prose (1-2 Sentences)

- **When to use:** the commit has an architectural tradeoff or non-obvious context.
- **Rule:** terse prose. Wrap at 72 characters. Write plain sentences without bullet points.

```
fix(auth): 🐛 sanitize null bytes in session cookies

Node 22 HTTP parser throws ERR_HTTP_INVALID_HEADER_VALUE on raw null
bytes from legacy clients during handshake.

Closes #182
```

### Mode 2: Bulleted List (2 to 4 Bullets Max)

- **When to use:** the commit spans 2 to 4 discrete changes or observable side-effects.
- **Rule:** use `-` and keep each bullet concise (capped at 4 bullets total).
- If a commit requires 5 or more bullets, the change is too broad. Split it into smaller commits.

```
feat(meeting): ✨ add representative attendance selection

- allow meeting organizer to flag attendee as acting representative
- disable direct attendance checkbox for represented accounts
- sync representative status to attendance audit trail
```

---

## Auto-Clarity

Always include a body (Mode 1 or Mode 2) for:

- Breaking changes (`BREAKING CHANGE: ...` or `!` in type)
- Security patches
- Database migrations
- Reverts of previous commits

Never compress these into subject-only.

## Exclusions

- 5 or more bullets (split the commit instead)
- Redundant bullets that just restate the subject line
- "This commit does X", "I", "we", "now", "currently"
- AI attribution trailers ("Generated with Claude Code", etc.)
- Asterisks (`*`) for bullets (always use `-`)

## Boundaries

Only generates the commit message. It does not run `git commit` or stage files. Output the message in a markdown code block ready to paste.

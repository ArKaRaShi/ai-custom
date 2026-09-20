---
name: git-commit
description: >
  Use when generating, drafting, or writing a git commit message. Covers Conventional
  Commits with or without emoji/unicode symbols, adaptive body, or when asked for
  an emoji commit, a plain conventional commit, or just "write a commit".
---

Write terse, exact Conventional Commits. Pick a subject **Style** (emoji or plain), then a body **Depth** (zero, prose, or bulleted). Style and Depth are independent.

## Repo Attribution Check (do first)

Before drafting, check the repo's own instructions (AGENTS.md, CLAUDE.md, CONTRIBUTING.md) for a mandated commit trailer.

- Repo specifies one (e.g. `Co-Authored-By: Claude <noreply@anthropic.com>`) → include it verbatim as the last line, every time, regardless of Style or Depth.
- Repo specifies nothing → omit AI attribution trailers by default (see Exclusions).

## Subject Style

Determine style from the request's signal words:

- **Emoji**: "emoji", "icon", a literal symbol (✨), "make it fun"
- **Plain**: "conventional", "no emoji", "standard", "professional"

**Neither signal present → ask one question before writing the message:** "Emoji or plain conventional commit?" Never guess when ambiguous.

Once known:

- **Emoji**: one symbol after the colon, `<type>(<scope>): ✨ <summary>`
- **Plain**: no symbol, `<type>(<scope>): <summary>`

`<scope>` optional (`<type>: ✨ <summary>`). Imperative mood ("add", "fix", "remove", not "added"/"adds"). ≤50 chars ideal, hard cap 72.

### Type-to-Icon (Emoji style only)

| Type | Emoji | Unicode | Purpose |
| --- | --- | --- | --- |
| `feat` | ✨ | ✦ | New feature |
| `fix` | 🐛 | ✖ | Bug fix |
| `refactor` | ♻️ | ↺ | Restructure, same behavior |
| `perf` | ⚡ | ⚡ | Performance |
| `docs` | 📝 | ✎ | Documentation |
| `test` | 🧪 | ✓ | Tests |
| `chore` | 🔧 | ⚙ | Tooling, deps, maintenance |
| `ci` | 🤖 | ⚑ | CI/CD |
| `build` | 📦 | ▤ | Build, packaging |
| `style` | 🎨 | ❖ | Formatting |
| `revert` | ⏪ | ↶ | Revert |

## Body Depth

- **Zero:** atomic/trivial change. No body that restates the subject.
- **Prose (1-2 sentences):** an architectural tradeoff or a *why* the diff alone doesn't explain. Wrap at 72.
- **Bulleted (2-4 `-` bullets):** 2-4 discrete changes. 5+ → split the commit.

## Auto-Clarity

A Zero body is never acceptable for breaking changes (`!` in type or a `BREAKING CHANGE:` footer), security patches, database migrations, or reverts.

## Exclusions

- 5+ bullets: split the commit instead.
- Bullets that merely restate the subject line.
- "This commit does X", "I", "we", "now", "currently".
- AI attribution trailers ("Generated with…", a `Co-Authored-By` AI line): default only. See Repo Attribution Check above.
- Asterisks (`*`) for bullets: always use `-`.

## Boundary

Generates the message only. Does not stage files or run `git commit`. Output the message in one Markdown code block, ready to paste.

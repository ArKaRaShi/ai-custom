---
name: skill-framework
description: Use when authoring, structuring, or extending authored skills, whether they contain executable tools.
---

# Skill Framework

Use this framework for every authored skill, including reference, technique, and workflow skills with no executable tools. Keep the entry point focused; place detailed layout, CLI, fallback, and extension guidance in the linked references.

**REQUIRE SUBSKILL:** `writing-skills` (`skill://writing-skills`).

If `skill://writing-skills` is unavailable or unreadable, follow [the bundled fallback](references/writing-skills-fallback.md) without stalling. Do not substitute another skill.

Every authored skill must declare and run a reproducible verification path. Check metadata, layout, Markdown, and local links. Executable content also needs applicable syntax, type, and correctness checks and an isolated check of changed behavior. Follow the [verification contract](references/primitives/verification.md) and report observed results and limits.

## References

- [Skill layout](references/skill-layout.md)
- [CLI contract](references/primitives/cli.md)
- [Dependency contract](references/primitives/dependencies.md)
- [Architecture contract](references/primitives/architecture.md)
- [Verification contract](references/primitives/verification.md)
- [Extending this framework](references/extending-framework.md)
- [TypeScript on Bun](references/starters/typescript.md)
- [Go skills](references/starters/go.md)
- [Writing-skills fallback](references/writing-skills-fallback.md)

## Verification

Use Bun 1.4 or later and the installed `markdown-quality` skill. Work from the skill directory.

Run `bun test tests/` for executable examples and `bun ~/.agents/skills/markdown-quality/scripts/review.ts . --mode=ai` for Markdown and local links. Both must exit zero. Confirm the `frontmatter` name matches the directory and layout follows the layout reference.

Review every executable example and test for syntax, explicit types, resource handling, and error paths, recording missing compiler or lint diagnostics as limits. Rerun relevant scenarios in `tests/authoring-scenarios.md` when guidance changes and record actual results. Use the layout reference's manual fallback if the Markdown checker is unavailable.

After changing starters, run `STARTER_ACCEPTANCE=1 bun test tests/starter-acceptance.test.ts --timeout 300000`. This opt-in check installs packages only in temporary fixtures and requires Bun and Go already installed. The default `bun test tests/` remains offline.

Run `bun ~/.agents/skills/skill-framework/scripts/layer-guard.ts scripts` from any skill directory that uses the Tier 1 layout from the [architecture contract](references/primitives/architecture.md). The framework's own tests cover the guard.

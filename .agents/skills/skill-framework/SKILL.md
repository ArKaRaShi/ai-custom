---
name: skill-framework
description: Use when authoring, structuring, or extending authored skills, whether or not they contain executable tools.
---

# Skill Framework

Use this framework for every authored skill, including reference, technique, and workflow skills with no executable tools. Keep the entry point focused; place detailed layout, CLI, fallback, and extension guidance in the linked references.

**REQUIRED SUB-SKILL:** Use `skill://writing-skills`.

If `skill://writing-skills` is unavailable or unreadable, and only then, follow [the bundled fallback](references/writing-skills-fallback.md). Do not substitute another skill.

## References

- [Skill layout](references/skill-layout.md)
- [CLI contract](references/primitives/cli.md)
- [Extending this framework](references/extending-framework.md)
- [Writing-skills fallback](references/writing-skills-fallback.md)

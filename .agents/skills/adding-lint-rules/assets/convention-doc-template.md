# <Convention name>

<!--
Keywords: <words a reader searches for>
Target paths: <globs of the code this convention governs>
-->

<One paragraph: the principle, why it matters, one concrete example of the mistake. Say whether untouched code must be rewritten.>

## When to Fix

Fix it when any of these holds:

1. <Condition the reader can observe>. `<short code example>`
2. <Condition>. `<example>`

No fix is needed when:

1. <Case the rule does not cover, and why>.

## The Pattern

1. <What to write, where it lives, how to name it>.
2. <The next rule of the pattern>.

## Exemptions

<Every case the checker leaves quiet, in the checker's own terms: contexts it skips, the allow-list and why each value is on it, skipped files or folders. Keep this list equal to the checker's behaviour.>

## Escape Hatch

End the line with `# <topic>-ok: <reason>` (`// <topic>-ok: <reason>` in TypeScript). The reason is required; a bare marker is still reported. Use it for a confirmed one-off, not a recurring case: a recurring case belongs in Exemptions and in the checker.

## Paired Examples

```<language>
# Avoid: <why the reader is misled>
<code with the mistake>

# Prefer: <what the fix makes visible>
<code following the pattern>
```

## Verification

```bash
<command that runs this rule on one file or folder>
```

# TypeScript on Bun

Existing tooling wins: merge missing checks instead of overwriting configuration. Documentation-only skills do not need an executable starter.

## Choose ownership

Shared: copy `assets/starters/shared-bun/` into `~/.agents/skills/` only on demand, then copy `assets/starters/typescript/` into the consuming skill. Set its package name. Initial explicit setup at the shared root is `bun install`; retain the generated `bun.lock`. Restore with `bun install --frozen-lockfile` at that root.

Override: add `assets/starters/typescript-override/biome.json` inside one skill to change indentation without another tool installation. `root: false` and `extends: "//"` inherit the shared defaults. Rule overrides do not change tool versions.

Standalone: copy shared configuration into the skill instead, merge its tool declarations into the skill's package, remove `extends` from the child compiler config, retain all shared compiler options and add `paths: {"@/*": ["./*"]}` with the skill's includes. Keep Biome `root: true`. Explicitly run `bun install` inside this skill and keep its `bun.lock`; `bun install --frozen-lockfile` there restores the same versions without any shared root.

A package file declaring scripts is not itself standalone tool ownership. The dependency declarations and setup directory identify the owner. Child aliases remain local to the child compiler configuration. TypeScript 7 uses `paths` without `baseUrl`; Biome 2.5 uses `preset: recommended`.

## Verify and fix

Run `bun run check` and `bun test` inside the skill. Check runs type checking, lint and format checks without installation or authored-file writes. `bun run fix` is the explicit safe-fix/format command; run check again afterward. Never use a downloading `bunx` fallback.

If shared settings or tools are absent, either explicitly set up `~/.agents/skills` or select standalone ownership. If tools exist but dependencies are missing, explicitly run `bun install --frozen-lockfile` in the directory that owns them. Installation requires dependency-contract approval; checking does not authorize it.

## Layered skeleton

For Tier 1 skills under the [architecture contract](../primitives/architecture.md), copy `assets/starters/layered-bun/` into the skill. It contains one domain function, one use case with one `execute` method, a parser and renderer, the `cli.ts` composition root, a use-case test and an end-to-end test of the real entry point. Add `application/interfaces/` and `infrastructure/` only when a use case calls out to I/O or plugins, following the architecture contract's boundary recipe. Run `bun ~/.agents/skills/skill-framework/scripts/layer-guard.ts scripts` after each change.

## Another PC

ai-sync v3 transfers shared package/config files and `bun.lock`, not `node_modules`. Installation remains an explicit command after pull. Until v3 is implemented, copy these files manually; no v2 bridge. Per-skill overrides and standalone package/config/lock files are copied with the skill.

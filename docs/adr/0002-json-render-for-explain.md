# Explain pages render from a lesson spec through json-render

Status: accepted

The visual companion's Explain route stops hand-writing HTML. The agent writes a short nested lesson spec in JSON, and a prebuilt React bundle built on `@json-render/react` validates it against a zod catalog and draws it. A hand-written explain page cost about 23 KB of markup per lesson, drifted from the real formulas, and needed the `vc-*` component library; a spec costs about 3 KB and its derivations evaluate live with mathjs.

## Considered options

- **Keep the `vc-*` components and hand-written HTML.** No new dependencies, but every lesson re-writes layout and JavaScript, and nothing checks that shown numbers match the code.
- **Write our own JSON renderer.** Full control, but we would own validation, state binding and the registry that json-render already provides.
- **json-render with a nested lesson spec (chosen).** The agent writes `{title, answer, sections:[{blocks}]}`; the renderer converts it to json-render's flat element map, so json-render stays an internal detail.

## Consequences

- The `vc-*` component library, its gallery and their tests are deleted. Prototype pages use the project's own CSS.
- `vc-diagram` is ported as a React Diagram block that reads the same text source.
- The renderer is committed prebuilt; changing a block means rebuilding it with `scripts/build-explain.ts`.
- json-render is a Vercel Labs project at 0.x; the version is pinned and upgrades are deliberate.

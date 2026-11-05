# Project style profiles

After the user explicitly approves a project-specific design, distill its confirmed reusable visual CSS into `.visual-companion/styles/<product-area>.css` for future companion sessions. A click or preview review alone is not approval. Design approval alone does not authorize implementation; proceed if implementation was also requested.

## Distill

1. Inspect the approved preview and the relevant project style sources. Limit inspection to the area and its existing profile.
2. Save only confirmed reusable properties. Record scope and source paths in CSS comments. Do not invent tokens or include page-specific layout and unapproved options.
3. Treat current source CSS as authoritative for existing styles. Keep an explicitly approved new direction in its own profile rather than forcing it into the existing style.
4. If a profile exists, compare and reconcile it with the sources and approved design. Preserve unrelated confirmed rules. Ask the user if the evidence does not resolve a conflict; do not blindly overwrite.

## Reuse

For a later task, check for a matching area profile. Verify relevant project sources if they may have changed. Do not force a saved profile onto an intentional new direction.

Stage the profile as an explicit dependency, then link it from the preview:

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" stage <project>/.visual-companion/styles/checkout.css checkout.css --project-dir <project>
```

Link `/files/checkout.css`. Stage referenced assets as well. Preserve CSS-relative paths that resolve under `/files/`; rewrite URLs that escape it. See [CLI](cli.md#stage) for staging and isolation limits.

The project-local `.visual-companion/.gitignore` ignores these profiles with `*`. They persist across local sessions, but are not shared through Git unless deliberately promoted elsewhere.

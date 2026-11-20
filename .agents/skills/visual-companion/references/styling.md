# Styling

Explain uses the lesson renderer's neutral theme. Prototype uses the project's own CSS or a saved profile checked against its current sources.

Stage each local dependency before referencing it through `/files/`:

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" stage <project>/styles/checkout.css checkout.css --project-dir <project>
```

A full HTML document keeps its own styles; fragments receive the companion frame, not a component library. Keep text contrast at least 4.5:1 and control boundaries and focus indicators at least 3:1. Never use color as the only signal. The full list is `quality-floor.md`.

Save a profile only after explicit approval of a project-specific design, per `style-profiles.md`. Inspect the preview at narrow widths and in each supported theme.

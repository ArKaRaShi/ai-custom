# Design

Use when the reader wants a proposed product page and expects it to look like their product: a checkout flow, a settings screen, a dashboard panel. The styling comes from the project, not from the companion's palette.

Route elsewhere when the reader is choosing between directions ([Decide](decide.md)) or learning how something works ([Understand](understand.md)).

## Order

1. **Read the project's real sources.** Open the stylesheet, tokens, and components the product already uses for that area. Check the current source first; memory and a saved profile come after it.
2. **Check for a profile.** A recorded area profile shortens step 1; verify it against the sources when they may have changed. See [style profiles](../style-profiles.md).
3. **Stage what the preview loads.** Each stylesheet, font, or image becomes an explicit `/files/` dependency:

   ```bash
   bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" stage <project>/path/app.css app.css --project-dir <project>
   ```

   Reference it through `/files/`; never a remote CDN, and never a file that escapes the session.
4. **Author with the product's own markup.** Reuse its class names and components. The preview then breaks the way the product would.
5. **Review in a browser**, then revise. Republish with `push`, or with `states` when the proposal has several full-viewport page states. [examples/design-checkout.html](../../examples/design-checkout.html) is the worked blueprint.

## Gates

- **A review is not an approval.** Opening the preview and nodding authorizes nothing and saves nothing.
- **Approving a design is not approving the build.** The approval covers the design; changing the product needs its own authorization.
- **Profiles are written after explicit approval of a project-specific design**, per [style profiles](../style-profiles.md): one file for the approved area, sources recorded in comments.

## Fidelity

Match fidelity to the question: sketches for structure, real components for spacing and type, full polish when polish is the thing being judged. Prefer real content to placeholder text when the content is what the reader judges.

## Isolation

`states` and `compare` copy each preview into a separate sandboxed iframe, with scripts, forms, and choices disabled. A preview that needs JavaScript will not work there; publish it with `push` instead, which runs its scripts. Do not weaken the sandboxed modes to make a preview work.

## Check before showing

1. Every asset the preview loads comes from `/files/`.
2. The project's text, surface, and accent colours come through; the companion palette overrides none of them.
3. The preview works at 320px, and in both themes when the product supports two.
4. Reviewing the preview leaves `styles/` empty.
5. A full-page proposal shows each state at full viewport height with the [state rail](../state-rail.md), not stacked into one scrolling page.

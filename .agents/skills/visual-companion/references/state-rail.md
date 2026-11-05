# State preview rail

Use the state rail for product page states, such as Default, Empty, and Error, that each need the full viewport and their own CSS. For explanations, use `page` instead, which stacks every part on one scrolling page. See [CLI](cli.md#page).

Publish separate complete HTML files as a state set:

```bash
bun "$HOME/.agents/skills/visual-companion/scripts/cli.ts" states "Default" /path/default.html "Empty" /path/empty.html --project-dir /path/project
```

The companion supplies the edge rail and narrow-screen selector outside the previews. Each preview occupies the full viewport in its own sandboxed iframe, so page CSS cannot affect the rail or another state. Hover or focus a tick to see its miniature without changing the page; click or activate it to select. Arrow keys move focus between ticks without selecting; press Enter or Space to activate the focused tick. On narrow screens use the selector. Keyboard events in a preview iframe do not propagate to the rail. The miniature uses a fixed viewport and can differ from the full preview's responsive layout.

Previews are static: scripts, forms, external resources, and choice reporting are disabled. Stage dependencies individually and reference them with `/files/` URLs; see [CLI](cli.md#stage). Edits do not automatically appear: rerun `states` to publish a new snapshot. Input errors leave the prior publication in place.

## Verification

After publishing, check selection, keyboard navigation, and the mobile selector in a browser. Skill maintainers run `bun test` in the skill directory after changing the rail.

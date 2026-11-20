# Quality floor

Minimum for every page on every route, Prototype included. WCAG 2.2 AA plus legibility limits.

## The floor

Limit (WCAG), then check.

- **Text contrast:** 4.5:1, large text 3:1 (1.4.3). `impeccable detect`; compute custom colours.
- **Control and focus-ring contrast:** 3:1 against neighbours (1.4.11). `impeccable detect`, look at the ring.
- **Not colour alone:** status is a shape and a word (1.4.1). Grayscale screenshot.
- **Text size:** 16px body; labels, table cells, buttons at least 11px. `impeccable detect`.
- **Line length:** at most about 75 characters.
- **Target size:** at least 24 by 24 CSS px, 44px for primary controls; in-sentence links exempt (2.5.8). Measure.
- **Keyboard:** every control works, focus visible and never hidden, no trap (2.1.1, 2.1.2, 2.4.7, 2.4.11). Tab through.
- **Headings:** one `h1`, no skipped level (1.3.1, 2.4.6). `impeccable detect`.
- **Names:** every input labelled; accessible name starts with the visible label; slider has `aria-valuetext` with its unit (4.1.2, 2.5.3).
- **Decorative glyphs:** `aria-hidden="true"` when a word follows (1.1.1).
- **Status messages:** one polite live region, updated once per burst, never per animation frame (4.1.3). Watch with a mutation observer.
- **Motion:** nothing auto-plays over 5 seconds or loops; honour `prefers-reduced-motion` (2.2.2). Emulate it.
- **Reflow:** no sideways scroll at 320px; code panes may scroll in their own box (1.4.10). Screenshot at 320px.
- **Without script:** the static form carries the whole answer. Disable JavaScript and reload.
- **Page language:** `<html lang="…">` (3.1.1).

## The detector

```bash
npx impeccable detect file.html          # list findings, exit 2 when there are findings
npx impeccable detect --json file.html   # one object per finding: rule, line, snippet
```

- Advisory. Needs Node 18.19 or newer. First run downloads its engine into the user's cache.
- Reads HTML, CSS and JSX; runs no scripts, so post-click states are not scanned.
- Fix legibility and access findings. Keep one that conflicts with a deliberate choice (the project's font) if the handover says why.

## Not checked by any tool here

A real screen reader, Safari and Firefox, contrast of every state. Say in the handover which you skipped.

# A page outside the shared layer states why

Three pump-report pages were written as hand-made documents with their own CSS, plain tables and no figures. They looked unlike the pages built from the shared layer, and nothing told the writer to use it: every tool was described as optional, and `ui.ts check` passed any page that used none of it.

A full page that uses no `ui-` class, no theme and no `/assets/ui` link now gets a `ui.ts check` warning, unless it carries `<meta name="own-style" content="reason">`. The reason lives in the file, so the choice is deliberate and visible to a reviewer. Prototype pages use it by design, since they keep the project's own CSS. Fragments are left alone because the companion frame styles them.

Consequences:

- The check stays advisory: a warning, never an error, and the page still publishes.
- The check cannot tell a good reason from a lazy one. It only makes the choice explicit.
- Freestyle starts from `templates/page.html`; the shared parts remain optional once you are on it.

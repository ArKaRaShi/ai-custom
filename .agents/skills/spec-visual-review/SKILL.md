---
name: spec-visual-review
description: Use when a user wants to visually review a Spec Kit specification, plan, contract, tasks, checklist, or other pre-implementation artifact, or a brainstorming design.
---

# Visual Specification Review

Turn the user's selected design artifact into a browser review that preserves the source and makes decisions easy to inspect. The page is a review aid, not proof that proposed behavior is implemented.

**REQUIRE SUBSKILL:** `brainstorming`. Read `skill://brainstorming/visual-companion.md` and follow its server and browser steps. The page is read-only and has no feedback controls: the user replies in the terminal. If the companion is unavailable or unreadable, report the visual limitation and provide an equivalent structured text review without stalling.

## Spec Kit Review Loop

When the user chooses this visual workflow for a Spec Kit feature, review it incrementally alongside the existing Spec Kit stages. This approval gate is part of the visual workflow, not a built-in Spec Kit guarantee.

1. Present the current stage's existing artifacts visually. Start with the spec when creating a new feature; do not create the plan, contracts, tasks, or checklists before the user explicitly approves the spec.
2. Ask for the user's feedback in the terminal. Show proposed changes before editing source meaning; apply changes only with approval, then update the visual review and ask again.
3. Wait for explicit approval of the current artifact or stage before creating the next stage's artifacts. Approval covers only the reviewed scope. Proceed to the next stage only when the user requests it.
4. Repeat the review and feedback loop for later artifacts, such as a plan and its contracts. Approval of a review or plan does not authorize implementation; obtain explicit implementation approval separately.

If the user selects a standalone existing artifact, review that artifact without creating earlier or later artifacts.

## Workflow

1. Read the selected artifact and identify its type and stage. For feature directories, resolve `.specify/feature.json` when applicable and inspect existing in-scope artifacts. Keep selected-file reviews scoped unless related files are requested; accept short or full brainstorming designs. Read [source mapping](references/source-mapping.md).
2. Inventory all in-scope content. Preserve IDs, priority, status, and wording. Identify absent or unresolved content; invent no IDs, decisions, or acceptance criteria.
3. When Current → After would help, inspect relevant code or cited evidence first. Cite exact source locations. If current behavior is not established, show `Current: unknown`. Label proposed behavior as proposed and illustrative examples as examples.
4. Build with the CLI, never hand-written HTML. One spec: `bun scripts/cli.ts translate <spec> --apply`, then `bun scripts/cli.ts render <spec> --apply --out <screen_dir>/review.html`. For Markdown stages run `bun scripts/cli.ts translate-markdown <source> --apply` for each source, then `bun scripts/cli.ts stages <stages.json> --apply --out <screen_dir>/review.html`. Set `approved` only after user approval. Source text is escaped; preserve wording and IDs. Formats: [CLI reference](references/cli.md).
5. Check Thai with `bun scripts/cli.ts check <spec>` or `bun scripts/cli.ts check-markdown <source>`. Put human corrections in the relevant cache's `overrides`. Thai is machine translation; English takes precedence. If setup is needed, preview `bun scripts/cli.ts setup`; its 2.5 GB download requires approval.
6. Add diagrams only for flows or structure supported by the source. **REQUIRE SUBSKILL:** `diagram-design` when creating a diagram. If unavailable or unreadable, report the limitation and use a text description instead without stalling. Follow its style setup while keeping the review dark. Label nodes with source IDs or identified source locators. Distinguish inferred relationships and examples from documented facts, omit unsupported links, and provide an accessible text equivalent.
7. Verify the rendered page in a browser, including an expanded case, the language toggle, and a narrow viewport. Confirm every inventory item is represented, original text and IDs match, examples are labelled, and unknowns remain visible. Correct mismatches before presenting it.
8. Present the page and source path, then follow the Spec Kit review loop above when applicable. For other artifacts, ask for feedback in the terminal and show proposed changes before editing source meaning. A visual review does not approve implementation.

## Verification

Prerequisites: Bun 1.4 or newer, `uv` for the model tests, Node for the script syntax check, a browser, and read access to the visual companion and selected artifacts. Work from `~/.agents/skills/spec-visual-review`. Install tooling once with `bun install --frozen-lockfile`. See [dependencies](references/dependencies.md). **REQUIRE SUBSKILL:** `markdown-quality`. If unavailable, inspect metadata, Markdown, and local links manually and report the limit without stalling.

1. Confirm the directory name and frontmatter name are `spec-visual-review`, and review the layout and every local link.
2. Run `bun run check`. It runs type checking, lint, and format checks. It must exit zero. Run `bun run fix` only as a separate, explicit step.
3. Run `bun "$HOME/.agents/skills/skill-framework/scripts/layer-guard.ts" scripts`. It must print `layers ok`.
4. Run `bun "$HOME/.agents/skills/markdown-quality/scripts/review.ts" . --mode=ai`. It must exit zero.
5. Check the Python worker with `python3 -m py_compile scripts/infrastructure/typhoon_worker.py`, then delete the `__pycache__` it creates. This Mac has no Python linter, so report that as a limit.
6. Check the template script: extract the inline `<script>` to a temporary file, run `node --check` on it, and delete the file.
7. Run `bun test tests/`; it must exit zero. Real-model opt-in: `SPEC_VISUAL_REVIEW_MODEL=1 bun test tests/cli.e2e.test.ts`.
8. In a browser, render a spec and switch language and theme. Click a sidebar link, open a deep link such as `#plan/design-decisions`, and check that the sidebar highlight follows scrolling. Open a story, an AC row, and the entity section on desktop and narrow viewports. Verify that every English item has one Thai line, that IDs and MUST keywords are unchanged, and that inferred links are labelled.
9. Exercise the incremental loop with a draft spec and a later plan. Verify that feedback causes revision and a refreshed page, no later artifact exists before explicit approval, and plan approval alone does not authorize implementation.
10. Render a `stages.json` with an approved spec and a draft plan. In a browser, verify the rail states, the stage switch, "Show beside", and a narrow viewport. Edit the approved source, render again, and verify the "changed after approval" banner on both stages.

Record each result and the unchecked limits: no Python linter, and the model-translation quality is checked only by the automatic glossary rules and a human reader.

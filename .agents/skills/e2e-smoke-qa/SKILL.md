---
name: e2e-smoke-qa
description: Use when a user requests an end-to-end smoke test and needs agreed scenarios checked across the browser, API, and database with linked evidence.
---

# E2E Smoke QA

Coordinate an agreed, evidence-backed smoke test across the real browser, API, and test database. The visual companion is the shared plan and result view. It must distinguish planned expectations from observed outcomes.

## Required specialist guidance

**REQUIRE SUBSKILL:** `brainstorming` for the visual companion. If unavailable, create an HTML plan view in an accessible browser URL.

**REQUIRE SUBSKILL:** `playwright-automation` for browser tests. If unavailable, follow the project's existing browser-test conventions and capture screenshots.

**REQUIRE SUBSKILL:** `api-testing` for API assertions. If unavailable, use existing project conventions to verify the agreed request/response contract.

**REQUIRE SUBSKILL:** `database-testing` for database assertions and safe test-data handling. If unavailable, use existing project conventions against an approved test database.

## Workflow

1. **Discover scope.** Ask what the user wants tested. Inspect relevant specifications (including `specify` cases), acceptance criteria, changed files, and existing tests. Present the source excerpts and paths that define the candidate scenarios. Do not infer that changed code is itself the specification.
2. **Agree scenarios.** When a relevant spec exists, map its acceptance criteria to proposed cases and confirm the intended scope with the user before execution. When no spec exists, propose exactly one case at a time, including setup, user action, and observable expected outcome. Ask whether the case is valid. Continue until the user accepts the cases. Record rejected and unresolved cases separately. Never execute unapproved cases.
3. **Draft before testing.** Use the brainstorming visual companion to show all agreed cases as `PLANNED`, without results or evidence. Each case records its UI action/result, API operation/contract, expected persisted DB state, evidence, and cleanup. Share the complete session URL. Wait for user feedback and update the plan if scope changes.
4. **Execute safely.** Run the approved cases against local or explicitly approved test environments with synthetic data. Exercise the normal user path. For each case, assert the visible browser result, the relevant real API response, and independently persisted DB state when those layers apply. A mock response is not proof of persistence. Capture a screenshot on both passing and failing browser paths. If capture fails or reaches the configured test deadline, mark the evidence check `BLOCKED`. Save API and DB observations as redacted artifacts. Clean up only test data created by the run and preserve evidence. When another required check times out before producing an observation, mark it `BLOCKED` and report the timeout. Use `NOT RUN` when a check was not attempted.
5. **Update and report.** Update the same companion with observed results and links to screenshot, API, DB, and test-run artifacts. Use `PASS` only when every required check ran and matched and required evidence is linked. Use `FAIL` if any executed assertion mismatched. Otherwise use `BLOCKED` if a required check or evidence capture was blocked. Use `NOT RUN` if no checks were attempted. Do not turn missing evidence or skipped required checks into a pass. Report each case status and the counts by status. Do not collapse mixed case statuses into an overall PASS. Include first mismatch, omitted checks and reasons, cleanup, artifact links, and the complete companion URL. Verify the URL and evidence links before claiming they are available.

## Safety gates

Stop before mutating production or real-user data. Ask for an approved test target when environment or mutation safety is unclear. Do not expose credentials, tokens, or unnecessary personal data in screenshots, companion content, or reports. A success message or HTTP 2xx alone never proves the DB stored the expected state.

## Verification

Prerequisites: read access to this skill directory and the installed `markdown-quality` skill. Run checks from this directory.

1. Confirm the directory and frontmatter name are both `e2e-smoke-qa`, required frontmatter exists, layout contains only permitted files, and all local links resolve. Any mismatch fails.
2. Run `bun ~/.agents/skills/markdown-quality/scripts/review.ts . --mode=ai`. Nonzero exit or unresolved local links fails.
3. Apply the workflow to the scenarios in `examples/checkout-plan-and-report.md`. Before approval, output only a planned case. When no spec exists, request approval one case at a time. After a browser/API pass with DB unavailable, do not report PASS. Successful browser paths include screenshot evidence. Any violation fails.
4. Record actual check results and any limits. This documentation-only skill has no executable tests. The scenario review is manual and does not prove application integration.

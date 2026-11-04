# Verification Contract

Every authored skill with executable content (a `scripts/` directory, code tests, or executable examples) must have a reproducible verification path appropriate to those contents. Apply this contract when creating or modifying such a skill. A documentation-only skill doesn't need a `Verification` section or verification path. External skills keep upstream files unchanged, with no bulk retrofit. Choose tools for the skill's contents rather than mandating a language, package manager, or linter.

## Required Verification Section

A skill with executable content includes a `Verification` section in `SKILL.md`, or links from it to a bundled reference containing:

| Field | Required content |
| --- | --- |
| Prerequisites | Required tools, supported versions, installation instructions, and working directory |
| Static checks | Exact commands or repeatable review steps and covered files. List syntax, type, and correctness lint checks separately for executable content, with a procedure or a reason each does not apply. |
| Behavior checks | For executable content, the isolated test or smoke scenario covering changed behavior, with expected output or state |
| Result | Observable success and failure criteria. Automated checks exit nonzero on failure. |
| Evidence | Commands or procedures actually exercised, observed results, and unverified limits |

## Select Checks by Content

| Content | Required checks |
| --- | --- |
| Every skill | Before delivery, check `frontmatter`, directory/name consistency, layout, Markdown quality, and local file links and heading anchors. The skill itself doesn't need a section for these checks. |
| Executable content | Check syntax. Use type checking where supported and correctness linting appropriate to the language, covering included scripts, tests, and executable examples. Give a reason for any check that does not apply. |
| Tier 1 `scripts/` layout | Run the framework's `scripts/layer-guard.ts` against the skill's `scripts/`. Add adapter tests against real dependencies and one end-to-end run through the real entry point, per the [architecture contract](architecture.md). |
| Changed behavior | Exercise the changed path in an isolated test or disposable smoke scenario. Static checks and passing unrelated tests do not establish behavior correctness. |
| Documentation only | Doesn't need a `Verification` section. A `SKILL.md`-only skill remains valid without an empty package manifest, fake passing script, or code-tooling dependency. |

Prefer existing tools and configuration. A documented procedure is valid when no suitable automated checker exists. Record steps and outcomes instead of claiming automated coverage. For executable Go or Bun skills, use the copyable [Go](../starters/go.md) or [TypeScript](../starters/typescript.md) starters where tooling is missing. Shared Bun tooling is optional; per-skill settings can inherit, override, or operate standalone. Installation is explicit and separate from read-only checks.

## Safety and Reproducibility

- Run checks without modifying included files or host state by default. Behavior checks may mutate disposable fixtures. Keep automatic fixes separate and explicit.
- Use isolated inputs. Access to production data, credentials, or network services requires a documented need and user approval.
- Declare verification tooling and supported versions under the [dependency contract](dependencies.md). Isolate dependencies. Keep applicable `lockfiles` and leave dependency directories `untracked`.
- Keep failures visible. Do not disable correctness checks, suppress whole classes of diagnostics, or exclude broken included files to get a pass. Document reasons for generated or third-party code exclusions.
- Run the declared static checks and relevant behavior checks before delivery. Report missing checkers as verification limits, using a documented safe fallback when available.

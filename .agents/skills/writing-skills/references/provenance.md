# Provenance

The rules in `SKILL.md` come from the sources below. The wording is ours, and this page credits the ideas.

| Source | What we took |
| --- | --- |
| Anthropic, [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) | Name and description limits, third person, the 500-line cap, one-level-deep references, a contents list over 100 lines, one default plus an escape hatch, exact commands for fragile steps, baseline-first testing on every model in use, scripts that handle their own errors, and a plan file checked before execution |
| [Agent Skills specification](https://agentskills.io/specification) | Name rules: lowercase letters, digits and single hyphens, with no hyphen at either end and a match to the directory name |
| Matt Pocock, `writing-for-agents` and `SKILL-MECHANICS.md` in [mattpocock/skills](https://github.com/mattpocock/skills) (MIT) | Description as a context pointer with one trigger per branch, the context-load and cognitive-load budgets, the choice of who invokes a skill, a completion criterion per step, positive phrasing, leading words, and deleting no-ops. Also: cache only what a lookup can't supply |
| Lauren Tan, pstack authoring playbook, read through a [mirror](https://github.com/JoshueOsuna/pstack) (MIT) | When in doubt, delete. Say what to do and skip the reason |
| Our own `ark-mode` playbooks | The `Exit:` wording on each step |
| The earlier `skill-framework` | Preview first and act only with `--apply` |

## Licenses and originality

On 2026-11-05 `gh api repos/mattpocock/skills --jq .license.spdx_id` and `gh api repos/JoshueOsuna/pstack --jq .license.spdx_id` both returned `MIT`. We read the Anthropic documentation and the Agent Skills specification but did not check their licenses.

- **Taken as ideas:** every item in the "What we took" column above. We restated each idea in our own words and copied no text from these sources.
- **Written independently:** the frame (Steps with `Exit:`, or Rules with The tests), both templates, the validator, `report.ts`, the scenario runner, and the evaluating guide.
- **One close match, removed:** the description example once mirrored the wording of the `tdd` skill description in the Matt Pocock skills. We replaced it with an example from our own `ai-sync` skill.

# .agents

Shared agent files for every harness on this Mac.

| Entry | Holds | Start at |
| --- | --- | --- |
| [`standards/`](standards/README.md) | contracts a hook or test enforces | the standard that matches your area |
| `skills/` | installed skill folders, one `SKILL.md` each | a skill whose description matches the task |

- A rule enforced by a hook or test belongs in `standards/`, not in a harness's
  instruction file. The instruction file is paid on every turn; a standard is read when
  it matters.
- Adding a root-level entry means adding one row to the table above.

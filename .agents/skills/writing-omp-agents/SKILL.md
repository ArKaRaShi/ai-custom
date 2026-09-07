---
name: writing-omp-agents
description: Use when authoring or refining OMP task-agent definitions to enforce narrow tool access and evidence-based completion.
---

# Writing OMP Agents

Write an OMP task agent as a narrow worker contract. Its description routes work, and its body governs execution.

Before authoring or revising one, read `omp://task-agent-discovery.md` for the current frontmatter schema, discovery precedence, role resolution, and spawn semantics. The discovery doc is the source of truth for OMP-specific behavior.

## RED: Find the actual failure

Before changing an agent, run one realistic task without the new wording. Capture the draft or transcript.

Classify the failure:

| Failure | Repair |
| --- | --- |
| Catch-all description | Name only concrete dispatch triggers. |
| Description explains workflow | Move process to the body. |
| Every tool or unrestricted spawning | Give only capabilities the lane needs. |
| Scope accepts architecture/security by default | State the bounded work class and escalation boundary. |
| “Done” is a summary | Require files/findings plus observed verification. |

If the baseline already holds the desired contract, do not add a skill or more prompt text.

## GREEN: Write the contract

Follow these guidelines to craft the agent contract:

### Description

Start with `Use when`. List only distinct task triggers, not personality, model, tools, or process.
The description must be one `Use when...` sentence. Do not prefix the agent name or state what it reads, edits, verifies, or delegates.

```yaml
description: Use when making a bounded single-file mechanical edit, generated boilerplate, or routine lookup.
```

### Frontmatter

- `name`: stable task name.
- `model`: a role alias when routing must be swappable.
- `thinkingLevel`: the lowest effort that reliably serves this lane.
- `tools`: declare a narrow list when the lane does not need the full harness.
- `spawns`: omit it unless the worker itself must delegate an independent slice.

### Instruction body

Use these four sections in order:

1. **Scope:** accepted work and explicit escalation boundary.
2. **Process:** read the target and nearest local pattern, then make the smallest requested change.
3. **Verification:** run the narrowest command or smoke path that observes the changed behavior.
4. **Completion:** report changed files or findings and the observed check result.

State the positive target. Do not turn the body into a generic repository constitution.
For an architecture, cross-module, or security lane, define its concrete slice and evidence boundary. Never label a catch-all worker as specialized.

## REFACTOR: Prove the contract

Run the same pressure scenario with the candidate agent. It passes only when its description routes narrowly and its instructions reject out-of-lane tasks.

If it finds a new escape hatch, add the smallest structural rule that closes it, then rerun the scenario. Keep one source of truth: model routing belongs in `modelRoles`, while task behavior belongs in the agent definition.

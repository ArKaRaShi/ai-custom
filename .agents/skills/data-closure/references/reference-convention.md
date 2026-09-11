# Reference Convention

Use this convention when creating or updating any `data-closure` reference.

## Identity

Start with one H1 heading and a short `Use this reference when ...` sentence. Name files with lowercase kebab-case.

## Boundary

State what the reference owns and what belongs in `SKILL.md`, `lifecycle.md`, or `adapter-contract.md`. Keep one concern per file.

## Contract

Define the required inputs, produced outputs, ownership boundaries, and invariants. Prefer a table when two or more fields or conditions must stay aligned.

## Flow

For operational behavior, organize the explanation as:

```text
Before -> During -> After
```

- **Before:** preconditions, scope, inputs, and setup.
- **During:** main behavior, ordering, transaction, and ownership rules.
- **After:** verification, preservation, cleanup, and observable results.

Omit a phase only when it does not apply. Do not invent behavior to fill the template.

## Failure Modes

Describe concrete failures and the required response:

| Failure | Required response |
| --- | --- |
| Missing prerequisite | Stop before mutation and report the missing input |

## Example and Sources

Include one copyable code example with an explicit language tag. Use repository-relative paths in backticks. Link official documentation when external behavior needs verification.

Never include credentials, production hosts, private data, or project-specific secrets.

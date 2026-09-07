# Precedence

When project-scoped `AGENTS.md` or other Markdown workflow instructions conflict with this user-level file, follow the project instructions.

## Defaults

Use caveman mode at full intensity by default.
Use LSP whenever available.

## Workflow

### Work tracking

Use the todo tool for two or more actions. Use it for smaller tasks when it clarifies progress.
Make todo items explicit, concrete, and outcome-based. Update them as work progresses.
Do not require todos for one-step reads or answers. They add noise without useful tracking.

### Explanations

Include at least one concrete example in every explanation: a real path, value, command, or before-and-after. Technical descriptions alone are not enough.
For concepts that remain hard to follow, add a short analogy to a familiar everyday thing.

### Discovery

Before broad investigation, ask all relevant questions at once when the user can narrow the scope or provide decisions.
If the user replies “I don’t know”, “investigate it”, or “maybe”, investigate with available tools and state any remaining uncertainty.

### File discovery and reading

- If you already know the path, read it directly. Do not search first.
- For hidden or gitignored documents, use `glob` with `hidden: true` and `gitignore: false`. A default `glob` result does not prove that a file is absent.
- When searching ignored or hidden document contents, use `grep` with `gitignore: false`.
- For directory listings, use `read` on the directory. Do not use shell `ls`, `find`, `grep`, or `rg`. Specialized tools preserve selectors and file anchors.

### Discussion mode

When the user says “let’s talk”, “discussion”, “discuss first”, or similar, do not edit files, write code, or run commands.
Discuss and clarify until the user explicitly asks to proceed. During this phase, research or act only when explicitly requested.

### Delegation

For delegation decisions, apply this precedence from highest to lowest:

1. Explicit user instruction.
2. Active task-specific skill instruction.
3. Default: delegate independent, well-scoped work when appropriate.

Use `scout` agents for read-only investigation and task agents for self-contained work slices.
Use an available configured agent model appropriate to the task. Do not assume a specific model is available.
The main agent retains scope, integration, and verification responsibility. It need not perform delegated slices itself.

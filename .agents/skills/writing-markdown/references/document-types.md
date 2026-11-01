# Document Types Standard

This guide defines the structure and required sections for standard documentation types consumed by AI agents.

> **Index:**
>
> | Section | Lines | Anchor |
> | :--- | :--- | :--- |
> | Agent Instruction Files (AGENTS.md) | L17-L47 | [#agent-instruction-files-agentsmd](#agent-instruction-files-agentsmd) |
> | Domain Context Notes (CONTEXT.md) | L48-L87 | [#domain-context-notes-contextmd](#domain-context-notes-contextmd) |
> | Architecture Decision Records (ADR) | L88-L114 | [#architecture-decision-records-adr](#architecture-decision-records-adr) |
> | Operational runbooks | L115-L152 | [#operational-runbooks](#operational-runbooks) |
> | Document Types Comparison | L153-L163 | [#document-types-comparison](#document-types-comparison) |

Every document category serves a specific operational purpose. Structuring each document type consistently allows an agent to locate constraints, commands, and domain invariants without scanning unstructured prose.

## Agent Instruction Files (AGENTS.md)

This file defines workspace rules, tool execution boundaries, and environment constraints.

### Core Sections

Every `AGENTS.md` file MUST contain these sections in this order:

1. **Precedence and Scope:** rules for resolving conflicts between local instructions and global defaults.
2. **Workspace Navigation:** directory tables and rules against editing parent directories.
3. **Environment Setup:** required runtime versions, venvs, package policies, and check commands.
4. **Testing and Verification:** test runners and command flags.
5. **Quality Standards:** lint, format, and type check commands with file target arguments.

### Section Rules

Keep instruction documents focused on execution rules rather than feature plans:

```markdown
<!-- Avoid: vague process advice in instructions -->
Try to run tests frequently during feature development.

<!-- Prefer: strict command boundaries in instructions -->
Before submitting changes, run:
`.venv-app/bin/python -m pytest --ds=apm.settings app/tests/`
```

Rationale: explicit command lines remove guesswork about test environments and settings flags.

---

## Domain Context Notes (CONTEXT.md)

A context note stores persistent domain knowledge, entity relationships, and calculation logic for a specific app or subdomain.

### File Location

Store context notes in dedicated subdirectories beside the code:

```text
docs/context/<app>/<subdomain>/CONTEXT.md
```

### Core Sections

Every context document MUST include these sections:

1. **Search Anchors:** relevant database models and service files listed in the first 20 lines.
2. **Ubiquitous Language:** glossary defining business terms and their exact code mappings.
3. **Invariants:** rules that must never break during calculations or state transitions.
4. **Calculations and Formulas:** mathematical equations written in plain text or standard LaTeX.
5. **Database Routing:** exact target database engine (`timescaledb`, `default`, or `spare_part_db`).

### Paired Pattern Rule

When documenting calculation patterns, provide paired examples:

```python
# Avoid: naive datetime truncation causing timezone drift
local_slot = timestamp.replace(minute=0, second=0, microsecond=0)

# Prefer: timezone-aware truncation preserving UTC offset
local_slot = timestamp.astimezone(ZoneInfo("Asia/Bangkok")).replace(
    minute=0, second=0, microsecond=0
)
```

Rationale: naive datetime truncation causes data drift when comparing local timestamps with UTC database records.

---

## Architecture Decision Records (ADR)

An ADR captures a design choice along with its technical context and trade-offs.

### File Location and Naming

Store ADR files under `docs/adr/` with zero-padded four-digit sequence numbers:

```text
docs/adr/0001-use-timescale-for-sensor-metrics.md
docs/adr/0002-isolate-worker-dependencies.md
```

### Required Sections

Every ADR MUST follow this structure:

1. **Title:** sequence number and decision summary.
2. **Status:** one of `Proposed`, `Accepted`, `Superseded`, or `Deprecated`.
3. **Context:** the technical limitations or requirements driving the decision.
4. **Decision:** the exact architectural pattern selected.
5. **Consequences:** positive outcomes, trade-offs, and downstream limitations.

Do not delete or edit historical ADR files when architecture evolves. Author a new ADR that supersedes the prior record.

---

## Operational runbooks

A runbook provides step-by-step procedures to resolve an incident or recover from system failure.

### Core Sections

Every runbook MUST provide these sections:

1. **Symptoms and Triggers:** error logs, metrics, or alerts that trigger this procedure.
2. **Preflight Checks:** read-only commands to confirm system state before making changes.
3. **Step-by-Step Procedure:** numbered actions with inline gates.
4. **Verification:** concrete check commands confirming the resolution.
5. **Rollback:** steps to restore prior state if the procedure fails.

### Runbook Structure

Structure every operational step with one command and expected terminal output:

````markdown
### Step 1: Drain active celery queues

Run:

```bash
celery -A apm control cancel_consumer default_queue
```

Expected output:

```text
-> default_queue: OK
```
````

Rationale: displaying expected command output allows the agent to verify success before executing later mutations.

---

## Document Types Comparison

The table below summarizes the key attributes of each documentation category:

| Document Type | Primary Target | Update Frequency | Location |
| --- | --- | --- | --- |
| `AGENTS.md` | Workspace execution rules | On tool or workflow changes | Workspace or worktree root |
| `CONTEXT.md` | Domain invariants and models | On business logic changes | `docs/context/<app>/<subdomain>/` |
| `ADR` | Architectural decisions | Immutable once accepted | `docs/adr/NNNN-*.md` |
| runbooks | Incident response and recovery | On infrastructure changes | `docs/runbooks/` or `playbooks/` |

---
name: principle-responsibility-boundaries
description: Use when assigning ownership, separating concerns, choosing dependencies, or deciding where behavior belongs in code. For module interface or seam design use codebase-design.
disable-model-invocation: true
---

# Responsibility Boundaries

**Principle:** separate code by responsibility, ownership, and reason to change instead of mandatory layers, classes, or directories.

**Why:** mixing unrelated concerns increases coupling while obscuring responsibility.

## The Pattern

- **Domain and policy:** express business rules, calculations, decisions, and invariants.
- **Application and orchestration:** coordinate use cases, workflows, transactions, and state transitions.
- **Infrastructure and mechanism:** run persistence, external integrations, messaging, file generation, and other technical capabilities.
- **Interface and presentation:** handle user interaction, transport, and representation.
- **Utilities:** provide general-purpose operations independent of application-specific meaning.

Treat these as conceptual boundaries rather than mandatory architectural layers or directory structures.

**One reason to change:** code that changes for the same reason, such as the same owner or decision, stays together. Code that changes for different reasons splits. This is single responsibility read as "reason to change", not "one function, one job". Name the owner of each reason before you split.

## Cross-Cutting Concerns

Authentication, authorization, validation, error handling, observability, caching, configuration, and consistency often cross boundaries. Separate policy from mechanism and assign clear boundaries rather than forcing the entire concern into one layer.

## State and Execution

Keep state with the component responsible for its lifecycle and invariants. An HTTP endpoint, UI event, or background worker may trigger a use case without containing its business rules.

## Decision Rules

- **Avoid:**
  - Mixing unrelated business decisions and technical mechanisms.
  - Treating every function or technical capability as a domain service.
  - Reproducing harmful patterns merely because they already exist.
  - Introducing layers or abstractions without clear benefit.
- **Prefer:**
  - Cohesive responsibilities, clear boundaries, appropriate dependency direction, and the simplest structure that maintains useful boundaries.

## The Tests

- Which module handles this decision or state?
- Is this a policy or a technical mechanism?
- Does this dependency belong to the responsibility?
- Would separating the concerns reduce complexity or just move code around?

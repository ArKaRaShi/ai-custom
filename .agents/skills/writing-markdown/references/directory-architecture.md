# Directory Architecture Standard

This guide defines how to structure, index, and organize documentation directories for AI agent discovery.

> **Index:**
>
> | Section | Anchor |
> | :--- | :--- |
> | README Section Index | [#readme-section-index](#readme-section-index) |
> | The Index-First Rule | [#the-index-first-rule](#the-index-first-rule) |
> | Single Source of Truth | [#single-source-of-truth](#single-source-of-truth) |
> | Retrieval Optimization (Search Anchors) | [#retrieval-optimization-search-anchors](#retrieval-optimization-search-anchors) |
> | Domain Grouping Hierarchy | [#domain-grouping-hierarchy](#domain-grouping-hierarchy) |
> | Archiving and Deprecation | [#archiving-and-deprecation](#archiving-and-deprecation) |

An unorganized documentation directory forces an agent to scan entire folder trees or guess where rules live. Structuring documentation into predictable paths with explicit indexes speeds up discovery and prevents context exhaustion.

## README Section Index

Use the directory's `README.md` to link each document to its relevant section with a heading anchor. Do not put source line numbers or ranges in indexes. They become stale when content shifts.

## The Index-First Rule

Every directory under `docs/` MUST contain an index `README.md` at its root.

The index acts as the directory manifest. It lists every child file and explains its specific purpose:

```text
docs/
├── README.md               # Root navigation map for all documentation
├── context/
│   ├── README.md           # Domain map listing apps and subdomains
│   ├── pump/
│   │   ├── README.md       # App index listing feature notes
│   │   └── plant.md        # Plant overview feature notes
```

### Index File Requirements

Every index `README.md` MUST provide:

1. **Overview:** one paragraph stating the subsystem or scope covered.
2. **Section links:** links from each document to its relevant heading anchor.
3. **Primary Entry Points:** links to canonical setup or architecture guides.

```markdown
- [API contracts, services, and repositories](architecture.md#api-contracts-services-and-repositories)
- [Store conventions](stores.md#store-conventions)
```

Rationale: stable heading anchors keep directory navigation useful without maintaining location details that shift as documents change.

---

## Single Source of Truth

Documentation must never duplicate code contracts or schema definitions across different files.

### Cross-Referencing by Relative Path

When a document references rules or schemas defined elsewhere, use direct relative Markdown links:

```markdown
<!-- Avoid: duplicating environment tables across documents -->
The worker uses settings at `apm.worker_settings` with Redis port 6379 and Celery queues.

<!-- Prefer: referencing canonical documentation -->
For worker settings and queue configurations, see [Worker Conventions](../../conventions/worker.md).
```

Rationale: duplicated text becomes stale when the primary configuration changes, creating conflicting instructions that degrade model execution.

### Link Verification Rule

Every relative link MUST resolve to an existing file on disk:

```bash
# Run link check from workspace root
bun ~/.agents/skills/markdown-quality/scripts/review.ts docs/ --mode=ai
```

Never author dead links or link to external web pages when the primary source is stored in the local repository.

---

## Retrieval Optimization (Search Anchors)

An agent uses keyword matching and semantic search to retrieve context files. Tune the top of each document for discovery.

### The 20-Line Anchor Standard

The first 20 lines of every document MUST declare search anchors:

1. **Target Subsystems:** specific app labels and directory paths.
2. **Key Symbols:** primary models, services, tasks, or API view classes.
3. **Relevant Globs:** file patterns associated with this topic.
4. **Error Keywords:** exact error strings or exceptions covered by this guide.

Example search anchor block:

```markdown
<!--
Keywords: pump_performance, SensorData, fault_match, Cavitation, timescaledb
Target paths: pump_performance/services/plant.py, pump_performance/models/
Errors: ValidationError, ActiveAlertNotFound
-->
```

Placing keywords in comments or headers ensures search tools match the file immediately during discovery turns.

---

## Domain Grouping Hierarchy

Organize documentation by domain boundaries rather than file types:

| Pattern | Structure | Evaluation |
| --- | --- | --- |
| Domain grouping | `docs/context/<app>/<subdomain>/` | Approved. Keeps related notes together. |
| Temporal grouping | `docs/2026-10/notes.md` | Prohibited. Obscures current state. |
| Role grouping | `docs/frontend/` and `docs/backend/` | Prohibited when spanning shared domains. |

Group by application and feature boundary. This mirrors backend code structure and keeps feature context self-contained.

---

## Archiving and Deprecation

When architecture changes or features deprecate, update documentation without leaving broken references.

### Deprecation Procedures

Follow these steps when deprecating a document:

1. **Add Deprecation Banner:** place a prominent warning at the top of the file pointing to the replacement document.
2. **Update Parent Index:** mark the item as `Deprecated` in the parent `README.md` navigation table.
3. **Remove Broken Inbound Links:** update sibling references to point to the new canonical file.
4. **Move to Archive:** if the document provides only historical record, move it to `docs/archive/`.

Never delete an active reference without checking all inbound Markdown links across the repository.

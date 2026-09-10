# Obsidian Topic Graph Reference

Use this reference when a completed session contains related findings. Keep `SKILL.md` short. Load this file for graph examples and edge cases.

## Graph Shape

```text
[[Project Anchor]]
  -> [[Topic Hub]]
      -> [[Deep Dive A]]
      -> [[Deep Dive B]]
      -> [[Procedure or Diagnosis]]
```

Folders store notes. Wikilinks provide the hierarchy.

## Note Responsibilities

| Node | Responsibility |
| --- | --- |
| Project anchor | System purpose, ownership, repositories, environments |
| Topic hub | Scope, context, active question, decision, child-note index |
| Deep dive | One focused procedure, diagnosis, benchmark, or design detail |

## Creation Order

1. Read the existing project anchor.
2. Group discoveries by durable topic.
3. Create the topic hub first.
4. Put context and the current decision in the hub.
5. Propose child notes under that hub.
6. After approval, create focused child notes.
7. Add `Part of: [[Topic Hub]]` to every child.
8. Add every child to the hub's Deep Dives list.

## Proposal Shape

Present one table grouped by topic, not one flat row per discovery:

```text
| Topic Hub | Child Note | Archetype | Captures |
|---|---|---|---|
| [[Prediction Pipeline]] | [[Task Batching]] | System Map | Worker-task design and benchmark |
| [[Prediction Pipeline]] | [[SensorData Cost]] | Diagnosis | Query timings and production caveats |
```

Ask for approval once for the topic set. Accept selected child notes or redirected paths without losing the parent hub.

## Example Hub

```markdown
---
tags:
  - scgp
  - architecture
  - ops
updated: 2026-09-08
---

# SCGP APM Prediction Pipeline

> Context and navigation for the sensor-fetch and anomaly-prediction flow.

## Scope

The pipeline fetches shared sensor catalogs, resolves model dependencies, and dispatches prediction worker tasks.

## Current Decision

Use bounded worker tasks with shared sensor preparation. Validate task cost with production timings before enabling partial-overlap merging.

## Deep Dives

- [[SCGP APM Prediction Task Batching]]
- [[SCGP APM SensorData Cost]]

## Related Project

Part of: [[SCGP APM]]
```

## Standalone Exception

Use a standalone note only when the user explicitly chooses it or when no durable parent topic exists. If related notes appear later, create the hub and link existing notes under it rather than duplicating their content.

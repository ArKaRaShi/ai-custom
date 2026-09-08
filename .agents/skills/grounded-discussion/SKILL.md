---
name: grounded-discussion
description: Use when evaluating software architecture, during library comparisons, or before technical refactors
---

# Grounded Discussion

Anchors open-ended technical discussions, architectural debates, and library evaluations in verifiable repository facts and authoritative primary documentation.

## Core Principle: No Opinion Without Grounding

Never answer architecture or design questions from generic training memory alone. Unanchored advice leads to greenfield bias and hallucinated APIs that break existing repo constraints.

Anchor every technical recommendation in two realities:

1. **Internal Anchor (Repo Facts):** existing dependencies, runtimes, configurations, and data models.
2. **External Anchor (Primary Docs):** verified documentation fetched via Context7 or official web documentation.

---

## When to Use

- When asked to compare, choose, or brainstorm technical choices ("should we use Redis or RabbitMQ?", "how should we design the caching layer?").
- When asked open-ended questions ("what do you think about…", "how would you refactor this?").
- During architectural planning before writing code or plans.

## When NOT to Use

- For direct, single-answer factual lookups ("what port is Flower on?" -> read and answer directly).
- During active bug fixing or executing pre-approved plans.

---

## Invariant 1: Inspect Before Opining

Before offering an architectural opinion or comparison:

1. Run repository reconnaissance (`read`, `grep`, `glob`).
2. Verify existing dependencies (e.g. `package.json`, `pyproject.toml`, Helm values).
3. Identify existing patterns: check whether the codebase already has a tool, client, or abstraction solving 80% of this.

---

## Invariant 2: Mandatory Source Provenance Tags

Every technical claim, library capability, constraint, or API behavior must explicitly state its source origin using provenance tags:

| Provenance Tag | Used For | Example |
| --- | --- | --- |
| `[Source: Repo / <path>:<line>]` | Existing code, configs, dependencies | `[Source: Repo / apps/scgp-app-apm-backend/settings.py:42]` |
| `[Source: Context7 / <library-id>]` | Modern libraries, frameworks, SDKs | `[Source: Context7 / celery/celery]` |
| `[Source: WebSearch / <url>]` | Official vendor docs, RFCs, manual specs | `[Source: WebSearch / https://cloud.google.com/kubernetes-engine/docs]` |
| `[Source: Cluster / <resource>]` | Live cluster state or inspected secrets | `[Source: Cluster / svc/scgp-platform-monitoring-grafana:443]` |

Never use uncited assertions or unverified training memory for API specifications.

---

## The 4-Part Output Recipe

Structure discussion and analysis responses using this exact order:

### 1. Repo Reality (Internal Anchor)

State the existing project baseline:

- Current runtime, versions, and relevant installed libraries.
- Existing files, schemas, or network boundaries that constrain the decision.
- Tag each observation with `[Source: Repo / <path>]`.

### 2. Verified Documentation (External Anchor)

Fetch and summarize the candidate library or approach from primary sources:

- Real API capabilities, breaking changes, and supported versions.
- Tag each finding with `[Source: Context7 / <id>]` or `[Source: WebSearch / <url>]`.

### 3. Empirical Trade-off Matrix

Do not write generic "Pros and Cons" bullet lists. Compare concrete options using this table:

| Option | Code Delta | New Dependencies | Operational Risk (3 AM Failure) | Repo Fit |
| --- | :---: | :---: | --- | :---: |
| **Option A** | ~30 lines | None (uses existing Celery) | Worker backlog if task stalls | Matches current worker topology |
| **Option B** | ~180 lines | Redis Streams | Extra stateful service to run | Introduces second message broker |

### 4. Recommendation & Failure Threshold

State a direct conclusion:

- Recommend the winning option and why it holds under current repo constraints.
- Define the **failure threshold**: the exact metric or condition where this choice must change.

---

## Anti-Speculation & Banned Language

Avoid vague AI conversational filler. Anchor claims in concrete facts:

| Banned Generic Phrase | Grounded Replacement |
| --- | --- |
| "In modern cloud-native architectures…" | "Under our current GKE cluster constraints (`512Mi` memory limit)…" |
| "Typically, developers prefer…" | "Our backend already imports `celery.app` at `task/celery_worker.py:12`…" |
| "A common best practice is…" | "According to Celery documentation `[Source: Context7 / celery]`…" |

---

## Rationalization Table

| Excuse | Reality |
| --- | --- |
| "Just a high-level discussion, no need to read code" | High-level advice that ignores repo constraints produces useless plans. |
| "I already know how this library works from training" | Training memory hallucinates versions, deprecated APIs, and removed flags. |
| "Adding source tags clutters the response" | Source tags provide credibility and allow the user to independently verify facts. |
| "Generic pros/cons lists are good enough" | Generic pros/cons hide operational risks and code complexity deltas. |

---

## Red Flags

- Giving an architectural recommendation without reading the existing repo dependencies first.
- Recommending a new external dependency without checking if an installed one already solves the problem.
- Technical claims without a `[Source: ...]` provenance tag.
- Comparing options with generic "pros and cons" bullets instead of an empirical trade-off table.

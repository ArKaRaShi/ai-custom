---
name: principle-experience-first
description: Use when product, UX, or feature-scope tradeoffs come up, to choose user experience over implementation convenience.
disable-model-invocation: true
---

# Experience First

**Principle:** When implementation convenience conflicts with the experience of whoever consumes the work, choose the experience.

**Why:** Convenience for the builder is paid for by every user, every day. A small polished feature set beats a large rough one.

## The Pattern

- Justify every feature, control, and option.
- Ship fewer features, polished, rather than more features, rough.
- Prototype before committing: design decisions are cheaper in throwaway HTML than in production code.
- Get the details right: transitions, alignment, spacing, feedback, error states.
- Tighten the core loop: each feature serves the central workflow or stays out of its way.
- Define the user as whoever consumes the work: the end user of a UI, the colleague who imports a library or calls an internal API, and the engineer who maintains the code next.

## Paired Example

```text
// Avoid: expose the internal shape because it is easy
POST /reports { raw_filters: "<internal query string>" }   // caller learns internals

// Prefer: shape the interface around the caller's task
POST /reports { plant_id, date_range }   // internals stay behind the endpoint
```

Rationale: the second interface costs more to build and saves every caller from learning the internals.

## The Tests

- Who consumes this, and what do they notice first?
- Does each control or option earn its place in the core loop?
- Are the empty, loading, and error states designed?
- Would a throwaway prototype settle the open choice faster than debate?

**Constraint:** This governs the target. Sequence of work is governed by foundations and domain modeling. Foundations should serve the experience, not the reverse.

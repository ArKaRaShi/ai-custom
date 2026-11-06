---
name: principle-redesign-from-first-principles
description: Use when integrating a new requirement into an existing design.
disable-model-invocation: true
---

# Redesign From First Principles

**Principle:** Integrate a change as if the requirement had been a foundational assumption from the start. Do not bolt it onto the existing design.

**Why:** Each bolt-on adds a special case, and the design drifts away from what the system now has to do. Redesigning keeps the option value of the whole design.

## The Pattern

- Read all affected files and understand the current design.
- Ask: "If we were writing this from scratch with this requirement, what would we build?"
- Propagate the change through every reference: types, docs, examples, rationale sections.
- Design the whole change first, then deliver it in increments.

## Paired Example

```text
// Avoid: add a tenant_id flag next to existing single-tenant code
if tenant_id: scoped_query(...) else: query(...)   // two paths in every caller

// Prefer: tenancy as a base assumption
every query takes a tenant scope; single-tenant callers pass the default scope
-> types, docs, and examples updated in the same change; delivered in steps
```

Rationale: the first version keeps two code paths alive forever. The second has one path, and the requirement is visible in the types.

## The Tests

- Did I read every affected file before choosing a shape?
- Can I describe the from-scratch design in one paragraph?
- Does any type, doc, or example still describe the old assumption?
- Can the redesign ship in verifiable increments?

**Constraint:** Redesign when the requirement changes a core assumption. For a local, self-contained change, the smallest change is enough. Get approval for a full design revision before coding it.

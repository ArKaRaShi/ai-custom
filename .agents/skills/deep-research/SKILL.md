---
name: deep-research
description: Use when investigating unfamiliar libraries or verifying technical specifications before writing code
---

# Deep Research

Conducts technical investigation into external libraries, frameworks, APIs, and cloud services using primary documentation.

## Core Principle: Zero Hallucinated Specs

Never guess signatures, options, flags, or behaviors from training memory. Retrieve and cite every technical fact, parameter, and config structure directly from primary sources.

## Core Workflow
1. **Ground locally.** Inspect repository lockfiles (`package.json`, `uv.lock`, `Cargo.lock`) to anchor queries to installed package versions.
2. **Route research.** Query Context7 (`xd://mcp__context7_*`) for runtime libraries; use `web_search` and `read` for cloud specs, RFCs, and release notes. See [Tool Routing Strategy](references/routing-strategy.md).
3. **Format citations.** Use natural Markdown links with context badges. Avoid repeated line-level tags. See [Citation Style](references/citation-style.md).
## Research Output Recipe

Structure technical investigation findings using these four sections:

### 1. Scope & Target Version

- Specific component, API, or feature investigated.
- Target version verified from workspace manifests or vendor documentation.

### 2. Verified Findings

- Confirmed API contracts, function signatures, config keys, and lifecycle behaviors.
- Provenance declared once at section scope or via numbered footnotes.

### 3. Minimal Verified Snippet

- Complete, runnable, minimal code or config matching verified documentation.
- No untested boilerplate or placeholder logic.

### 4. Constraints & Breaking Caveats

- Runtime boundaries, breaking changes from previous versions, resource limits, or deprecations.

## References

- [Citation Style & Provenance Rules](references/citation-style.md)
- [Tool Routing & Research Strategy](references/routing-strategy.md)

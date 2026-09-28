# Tool Routing & Research Strategy

Guidance for selecting tools and anchoring investigations to primary documentation.

## Tool Routing Rules

Route queries through three distinct anchors:

1. **Context7 (`xd://mcp__context7_*`)**
   - **Step 1:** call `resolve-library-id` with the package name.
   - **Step 2:** call `query-docs` with the resolved ID and a focused topic.

2. **Web Search & Direct Reading (`web_search` + `read`)**
   - **Scope:** cloud vendor specs, RFCs, GitHub release notes, live issue trackers, or tools missing from Context7.
   - Never rely solely on search engine summary snippets.

3. **Repository Lockfile Grounding (`read`, `grep`)**
   - Inspect local package manifests (`package.json`, `pnpm-lock.yaml`, `pyproject.toml`, `uv.lock`, `Cargo.lock`, `go.mod`) before searching external docs.
   - Pin the investigation to the installed version to avoid gathering incompatible documentation.

---

## Tool Selection Matrix

| Investigation Target | Primary Tool | Secondary Tool |
| --- | --- | --- |
| Popular runtime library (React, FastAPI, Celery) | Context7 | Web Search |
| Cloud infrastructure (AWS ECS, GCP Cloud Run) | Web Search + `read` | Context7 |
| RFCs and internet protocol standards | Web Search + `read` | None |
| Workspace package version verification | Local lockfile read | None |
| CLI flag syntax and commands | Official docs via Web Search | `tool --help` |

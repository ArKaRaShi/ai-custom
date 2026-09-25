---
name: deep-research
description: Use when investigating unfamiliar libraries or verifying technical specifications before writing code
---

# Deep Research

Performs rigorous, autonomous technical investigation into external libraries, frameworks, APIs, and cloud services using authoritative primary documentation.

## Core Principle: Zero Hallucinated Specs

Never guess signatures, options, flags, or behaviors from training memory. Training data frequently misremembers deprecated flags, removed APIs, or subtle version differences.

Retrieve and cite every technical fact, type definition, parameter name, and config structure directly from primary sources.

---

## Tool Routing Strategy

Route research questions through two external anchors and one local anchor:

1. **Context7 Documentation (`xd://mcp__context7_*`)**
   - **Target scope:** libraries, frameworks, SDKs, runtime APIs (e.g. Next.js, Prisma, Tailwind, Celery, React Router, LangChain).
   - **Step 1:** call `resolve-library-id` with the package/library name.
   - **Step 2:** call `query-docs` with the resolved ID and focused topic to retrieve current docs and code examples.

2. **Web Search & Direct Reading (`web_search` + `read`)**
   - **Target scope:** cloud provider specs, RFCs, GitHub release notes, live issue trackers, CVEs, or tools not indexed in Context7.
   - Run `web_search`, then use `read` on the target documentation URL. Never rely solely on search engine summary snippets.

3. **Repository Lockfile Grounding (`read`, `grep`)**
   - Before researching external docs, inspect local dependency manifests (`package.json`, `pnpm-lock.yaml`, `pyproject.toml`, `uv.lock`, `Cargo.lock`, `go.mod`).
   - Anchor queries to the exact version currently installed in the workspace to avoid studying incompatible versions.

---

## Mandatory Source Provenance Tags

Every technical assertion, parameter, code snippet, and constraint must include an explicit provenance tag:

| Provenance Tag | Source Type | Example |
| --- | --- | --- |
| `[Source: Context7 / <library-id> / <topic>]` | Official library docs fetched via Context7 | `[Source: Context7 / celery/celery / task-retries]` |
| `[Source: WebSearch / <url>]` | Vendor docs, RFCs, manual specs | `[Source: WebSearch / https://cloud.google.com/run/docs/configuring/cpu]` |
| `[Source: Repo / <path>:<line>]` | Local lockfiles, configs, existing callsites | `[Source: Repo / package.json:24]` |

Never produce uncited technical claims or state API contracts without verification.

---

## Research Output Recipe

Deliver investigation findings using this 4-part structure:

### 1. Scope & Target Version

- Specific component, API, or feature investigated.
- Exact target version (verified from local lockfile or latest stable).

### 2. Verified Findings

- Exact API contracts, function signatures, config keys, and lifecycle behaviors.
- Each finding tagged with `[Source: Context7 / ...]` or `[Source: WebSearch / ...]`.

### 3. Minimal Verified Snippet

- Complete, runnable, minimal code or config matching verified documentation.
- No untested boilerplate or placeholder logic.

### 4. Constraints & Breaking Caveats

- Runtime constraints, breaking changes from previous versions, memory/CPU bounds, or deprecation notices.

---

## Rationalization Table

| Excuse | Reality |
| --- | --- |
| "I already know this library's API from training" | Training memory regularly hallucinates removed options or obsolete patterns. |
| "A search snippet is enough without opening the URL" | Search snippets lack parameter details, error conditions, and version tags. |
| "Checking local lockfiles takes extra calls" | Researching the wrong library major version invalidates the entire investigation. |
| "Source tags make output too verbose" | Provenance tags provide verifiable audit trails confirming facts match ground truth. |

---

## Red Flags - STOP and Verify

- Stating a library parameter or configuration key without querying Context7 or primary documentation.
- Recommending an API without checking which version the repository lockfile specifies.
- Omitting provenance tags from technical claims.
- Copying syntax from unverified blog posts or training memory.

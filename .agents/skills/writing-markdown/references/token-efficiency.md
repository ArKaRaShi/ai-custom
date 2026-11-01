# Token Efficiency Standard

This guide defines rules for improving token density and semantic clarity in Markdown documentation.

> **Index:**
>
> | Section | Lines | Anchor |
> | :--- | :--- | :--- |
> | Converting Narrative Prose to Tables | L17-L36 | [#converting-narrative-prose-to-tables](#converting-narrative-prose-to-tables) |
> | Catalog of Dead Phrases to Remove | L37-L58 | [#catalog-of-dead-phrases-to-remove](#catalog-of-dead-phrases-to-remove) |
> | Imperative Voice and Strict Verbs | L59-L83 | [#imperative-voice-and-strict-verbs](#imperative-voice-and-strict-verbs) |
> | The Terminal Verification Contract | L84-L111 | [#the-terminal-verification-contract](#the-terminal-verification-contract) |
> | Density Check Benchmarks | L112-L129 | [#density-check-benchmarks](#density-check-benchmarks) |

An AI agent has a limited working context window. Bloated documentation filled with conversational filler, passive narrative paragraphs, and unrendered formatting burns tokens and degrades reasoning accuracy. High-density documentation delivers constraints and instructions directly.

## Converting Narrative Prose to Tables

Narrative paragraphs that describe branching conditions waste tokens and hide edge cases. Always convert multi-variable logic into structured Markdown tables.

```markdown
<!-- Avoid: narrative branching paragraphs -->
If you are running in local development mode, point your database configuration to 127.0.0.1 on port 3307 using the apm user. But if you are executing within docker compose, use the mysql service name on port 3306. For staging, consult the vault secret for the host address.

<!-- Prefer: structured decision table -->
| Environment | Host | Port | User |
| --- | --- | --- | --- |
| Local | `127.0.0.1` | 3307 | `apm` |
| Docker compose | `mysql` | 3306 | `apm` |
| Staging | Staging vault host | 3306 | Vault secret |
```

Rationale: tables reduce token consumption while making branch conditions and defaults explicit to parser extractors.

---

## Catalog of Dead Phrases to Remove

Delete conversational transitions, apologetic hedging, and polite opening phrases.

Common filler phrases to delete:

```text
Dead Phrase                         Approved Replacement
"in order to"                    -> "to"
"it is important to note"        -> state the invariant directly
"please note that"               -> delete
"it is recommended that"         -> "MUST" or "SHOULD"
"at this point in time"          -> "now" or delete
"due to the fact that"           -> "because"
"with regard to"                 -> "for"
"in the event that"              -> "if"
```

Do not write meta-commentary about the documentation itself, such as referring to previous sections.

---

## Imperative Voice and Strict Verbs

Author instructions in the active imperative voice. Tell the agent exactly what action to take, what gate to verify, and what condition stops the process.

```markdown
<!-- Avoid: passive and polite suggestions -->
You should probably think about creating a worktree so that you do not overwrite changes.

<!-- Prefer: direct imperative commands -->
Create an isolated git worktree before making code edits.
```

Rationale: soft suggestions create ambiguity, leading models to skip safety checks or proceed past unverified conditions.

### Keyword Invariant Mapping

Use RFC 2119 imperative keywords consistently:

- **MUST / REQUIRED:** unconditional constraint. No exceptions allowed.
- **NEVER:** strict negative invariant. Action is forbidden under all conditions.
- **SHOULD / RECOMMENDED:** default practice. Valid deviations require an explicit ruling.
- **MAY / OPTIONAL:** permissible alternative chosen at the executor's discretion.

---

## The Terminal Verification Contract

Every technical procedure, runbook, or setup guide MUST conclude with a concrete, copy-pasteable terminal verification command.

Never conclude a procedure with passive summaries. Provide the exact check command and the expected output:

````markdown
<!-- Avoid: unverified completion summary -->
Your celery worker is now restarted and running properly.

<!-- Prefer: explicit verification command -->
Verify worker registration:

```bash
celery -A apm inspect ping
```

Expected output:

```text
-> celery@worker-1: OK
```
````

Rationale: ending procedures with a verification check gives the executing agent a clear stopping criterion and immediate feedback on execution success.

---

## Density Check Benchmarks

Run the `markdown-quality` density analyzer to assess documentation token density:

```bash
bun ~/.agents/skills/markdown-quality/scripts/review.ts <file> --check-density
```

Target benchmarks by document category:

| Document Type | Target Word Count | Token Density Rating |
| --- | --- | --- |
| `SKILL.md` entry point | 200 to 400 words | High (Compact) |
| Feature context note | 400 to 800 words | High (Compact) |
| Architecture Decision Record | 300 to 600 words | High (Compact) |
| Operational Runbook | 200 to 500 words | High (Compact) |
| In-depth reference guide | 500 to 1200 words | High (Compact) |

---
name: obsidian-distill
description: Use when distilling, extracting, or saving operational discoveries, terminal commands, runbooks, architecture mappings, or incident gotchas from a completed session into an Obsidian vault or second-brain markdown notes
---

# Obsidian Distill

Transform raw interactive sessions and terminal discoveries into durable, curated markdown notes within any Obsidian vault.

## Core Principle: Refactor, Don't Copy

Never copy-paste raw session transcripts into a knowledge vault. Transcripts contain conversational filler, syntax typos, failed attempts, and sensitive secrets.

Extract only the **"Golden Path"**:

1. Problem trigger and context.
2. Verified working command sequence.
3. Prerequisites (environment variables, tools, access).
4. Dynamic secret retrieval (never plain secrets).
5. Exact error strings for searchability.

---

## When to Use

- At the end of an operational, debugging, or infrastructure exploration session.
- When the user asks to "extract to obsidian", "save this to my vault", "/distill", or "document what we did".
- After figuring out complex port-forwards, secret pipelines, or environment fixes.

## When NOT to Use

- During active troubleshooting (finish the fix first, distill at the end).
- For project codebase changes that belong in repository code or repo documentation.
- For transient one-off scripts with zero future reuse value.

---

## The Distillation Pipeline

```
[Session Complete]
        │
        ▼
Phase 1: Vault Discovery (Inspect vault folders, templates, style guide)
        │
        ▼
Phase 2: Semantic Classification (Map knowledge to archetypes & score 1★ to 5★)
        │
        ▼
Phase 3: Adaptive Proposal Gate (Propose paths matching detected vault layout)
        │
        ▼
Phase 4: Write Notes (Match vault frontmatter, copy-paste blocks, dynamic secrets)
        │
        ▼
Phase 5: Quality Audit (Run markdown-quality on created or modified notes)
```

---

## Phase 1: Vault Discovery Protocol

Before proposing or writing notes, discover the target vault's structure:

1. **Locate the Vault:**
   - Check user prompt for an explicit path (e.g. `~/Disk/vault`).
   - If unstated, check common paths or search for `.obsidian/`.
2. **Inspect Existing Folder Ontology:**
   - Read top-level directories to identify the vault structure (e.g. PARA, Johnny Decimal, flat, or functional folders like `Runbooks/` / `Projects/`).
3. **Detect Local Style Guides:**
   - Check root `README.md` or style guide for local conventions, frontmatter schemas, and tagging rules.
4. **Discover Reusable Templates:**
   - Check for template folders (`Templates/`, `_templates/`, `.templates/`).
   - Reuse existing template headers and metadata fields to maintain consistency with the user's existing notes.

---

## Phase 2: Semantic Archetypes and Longevity Ranking

Do not assume hardcoded folder names. Classify discoveries into **universal semantic archetypes** and map them to the target vault's existing layout:

| Archetype | Description | Longevity | Example Folder in Vault | Action |
| --- | --- | :---: | --- | --- |
| **Procedure** | Step-by-step operational task or runbook | 5★ (Months to Years) | `Runbooks/`, `01 Projects/`, `Guides/` | Write full procedural note: access, commands, stop steps |
| **System Map** | Architecture overview, component relation | 4★ (Months) | `Projects/`, `02 Areas/`, `Architecture/` | Create or update parent system overview |
| **Diagnosis** | Exact error signature and root cause fix | 3★ (Weeks to Months) | `Troubleshooting/`, `03 Resources/`, `Incidents/` | Write diagnostic note with error text and fix |
| **Recipe** | General CLI syntax and reusable tool recipes | 2★ (Reusable) | `Cheatsheets/`, `03 Resources/`, `Snippets/` | Append or create syntax reference |
| **Transient** | Typo fixes, exploratory errors, one-off output | 1★ (Hours) | Discard | Skip (never save ephemeral noise) |

---

## Phase 3: Adaptive Proposal Gate (REQUIRED)

**Never write notes without presenting the proposal table first.**

Map each candidate discovery to the vault's detected folders and present the proposal:

```text
Detected vault schema at <path> (<detected folders>)

| # | Score | Archetype | Suggested Vault Path | What it Captures |
|---|:---:|---|---|---|
| 1 | 5★ | Procedure | `<detected-folder>/<Note Name>.md` | <One-sentence summary of workflow> |
| 2 | 3★ | Diagnosis | `<detected-folder>/<Error Name>.md` | <Exact error string and resolution> |

Reply with:
- "all" or specific numbers ("1, 2") to confirm
- Or redirect paths (e.g. "put 1 into Docs/ instead")
```

Wait for user confirmation before creating or editing any files in the vault.

---

## Phase 4: Universal Invariants

Apply these rules across all vaults, regardless of organizational style:

1. **Dynamic Secrets Only:**
   - NEVER write plaintext passwords, tokens, or private keys.
   - Output commands that fetch credentials on demand:

     ```bash
     kubectl -n <ns> get secret <name> -o jsonpath='{.data.KEY}' | base64 --decode; echo
     ```

2. **One Code Block = One Action:**
   - Keep blocks copy-paste ready for operational incidents.
   - Append `; echo` to base64 decode pipelines to prevent shell prompt collision.
3. **Match Vault Metadata Conventions:**
   - Align with the vault's frontmatter style (YAML tags, dates, project links).
4. **Exact Searchable Error Signatures:**
   - In diagnostic notes, quote the exact error message so Obsidian quick switcher (`Cmd+O`) and search (`Cmd+Shift+F`) find it immediately.

---

## Phase 5: Verification

After writing notes:

1. Verify internal links and `[[wikilinks]]`.
2. Run `markdown-quality` on each new or modified note:

   ```bash
   bun "$HOME/.agents/skills/markdown-quality/scripts/review.ts" "<note.md>" --fix
   ```

3. Confirm status is **CLEAN** before completing the turn.

---

## Rationalization Table

| Excuse | Reality |
| --- | --- |
| "I know where this belongs, no need to inspect the vault" | Different vaults use different systems (PARA, flat, Johnny Decimal). Inspect first. |
| "I'll write all notes directly without proposing" | Clutters user vault with unwanted files. Always propose and wait. |
| "Writing the plain password is more convenient" | Violates security policy. Vault notes sync across machines and cloud. |
| "I should copy the full trial history of commands" | Noise drowns signal. Extract only the verified working command. |
| "Skip markdown-quality to finish faster" | Markdown quality catches broken fences, orphan headings, and style defects. |

---

## Red Flags

- Assuming folder names (`Runbooks/`, `Projects/`) without checking what the vault actually contains.
- Writing any file to the vault before the user responds to the proposal table.
- Plaintext credentials or tokens anywhere in note body.
- Independent commands combined into one uninterrupted code block.
- Skipping `markdown-quality` check.

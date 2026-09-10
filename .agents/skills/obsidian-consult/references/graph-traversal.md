# Graph Traversal & Extraction Guide

How to search and extract Golden Path knowledge from an Obsidian engineering vault.

---

## 1. Graph Traversal Flow

```text
1. Project Anchor (`Projects/<Project>.md` or `01_Projects/<Project>.md`)
        │
        │ Follow [[wikilinks]]
        ▼
2. Topic Hub (`Projects/<Topic>.md` or `01_Projects/<Topic>.md`)
        │
        │ Follow [[wikilinks]]
        ▼
3. Deep Dive / Runbook / ADR (`Runbooks/`, `02_ADRs/`, `03_Runbooks/`)
```

---

## 2. Archetype Extraction Rules

Follow these rules when extracting verified details from matching note types:

### A. Operational Runbooks (`Runbooks/` or `03_Runbooks/`)
- Extract one code block per action.
- Verify copy-paste readiness (commands must be complete with namespaces and flags).
- **Secrets Protocol**: if a runbook provides a secret retrieval command, execute it or present the command to the user. Never echo or write plain decrypted secrets into markdown files or chat output.

### B. System Maps & ADRs (`Projects/`, `01_Projects/`, `02_ADRs/`)
- Extract architectural decisions, data models, and constraints.
- Cite the vault source note using wikilink notation: `According to vault note [[ADR-0012-Pump-Location-Model]]: ...`.

### C. Troubleshooting Post-Mortems (`Troubleshooting/` or `04_Troubleshooting/`)
- Search by exact error signature.
- Verify whether the environment matches (OS, architecture, dependency versions).
- Extract the verified fix command directly.

---

## 3. Fast CLI Search Recipes

To locate notes inside the vault without heavy indexers:

```bash
# 1. Search note titles (fuzzy file match)
find "$VAULT_DIR" -name "*.md" | grep -i "<service-name>"

# 2. Search exact error signatures
grep -rn "$ERROR_SIGNATURE" "$VAULT_DIR/Troubleshooting" "$VAULT_DIR/04_Troubleshooting" 2>/dev/null

# 3. Search tags in frontmatter
grep -rn "tags:.*<tag>" "$VAULT_DIR" 2>/dev/null
```

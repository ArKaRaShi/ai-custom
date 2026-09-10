---
name: obsidian-consult
description: Use when looking up runbooks, connection procedures, known error post-mortems, or system architecture in the knowledge vault
---

# Obsidian Consult

Consult the curated Obsidian knowledge vault before attempting blind investigation or guessing commands.

## When to Use

- Asked how to access a service, port-forward, or retrieve credentials.
- Investigating an architecture, database topology, or component relationship.
- Encountering an infrastructure or runtime error that may have a verified fix.
- Onboarding to a project with an existing anchor in the vault.

## When NOT to Use

- When the task requires creating, editing, or distilling vault notes (use `obsidian-distill`).
- When searching ephemeral conversational history or user preferences (use Mnemopi `recall`).
- When looking up public library documentation (use Context7).

## Quick Reference

| Knowledge Need | Vault Target | Extraction Action |
|---|---|---|
| Port-forward / Access | `Runbooks/` (`03_Runbooks/`) | Extract single-action copy-paste commands |
| Secrets / Auth | `Runbooks/` (`03_Runbooks/`) | Extract runtime retrieval command (never plain secrets) |
| Architecture / Topology | `Projects/` (`01_Projects/`) | Traverse Project Anchor ──► Topic Hub ──► cite source |
| Error Signatures | `Troubleshooting/` (`04_Troubleshooting/`) | Match error text ──► extract verified fix |

## Navigation Protocol

1. **Resolve Vault Path**: follow the 4-step resolution order in [`references/vault-discovery.md`](references/vault-discovery.md). Never hardcode paths.
2. **Graph Traversal**: follow the knowledge graph from Project Anchor ──► Topic Hub ──► Deep Dives per [`references/graph-traversal.md`](references/graph-traversal.md).
3. **Extract the Golden Path**:
   - Runbooks: extract copy-paste ready commands. Do not guess ports or namespaces.
   - System Maps & ADRs: extract decisions and cite the source note using wikilink notation (`From vault note [[Note Name]]: ...`).
   - Troubleshooting: match the exact error text and apply the documented fix.

## Universal Invariants

- **Strictly Read-Only**: zero file writes, mutations, or edits. Do not alter notes during consultation.
- **Never Echo Plain Secrets**: when a note documents a secret retrieval pipeline, execute the command or provide it to the user. Do not print or store plain decrypted credentials.
- **Mandatory Source Citation**: cite the vault source note so users can verify provenance.

## Rationalization & Red Flags

| Excuse | Reality & Counter-Rule |
|---|---|
| "I'll just inspect k8s directly" | Check the vault first. It already has the verified namespace, port, and secret key. |
| "I know this command from memory" | Memory drifts across projects. Consult the runbook. |
| "I'll create a note while reading" | Read-only. Use `obsidian-distill` at session completion instead. |

Red flags:
- Guessing a port or secret name when a runbook exists.
- Writing to vault files during a consult turn.
- Answering without citing the source note.

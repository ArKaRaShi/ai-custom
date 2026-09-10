---
name: obsidian-distill
description: Use when distilling completed debugging, operational, architecture, or investigation sessions into durable Obsidian notes
---

# Obsidian Distill

Curate verified session discoveries into an Obsidian knowledge graph. Refactor evidence into durable context, decisions, and procedures. Never archive raw transcripts.

## When to Use

- Session is complete with verified commands, diagnosis, system map, or architecture decisions.
- User requests distilling, saving, or extracting findings into Obsidian.

## When NOT to Use

- Investigation is active.
- Output is transient noise or one-off typos.
- Content belongs in repository documentation instead.

## Quick Reference

1. Locate vault via [`references/vault-discovery.md`](references/vault-discovery.md).
2. Classify into semantic archetypes (Procedure, System Map, Diagnosis, Recipe, Transient).
3. Create a topic hub before any deep-dive note.
4. Present one grouped proposal table and wait for confirmation.
5. Write approved notes with frontmatter and parent wikilinks.
6. Run `markdown-quality` to reach `CLEAN`.

## Core Principle: Refactor, Don't Copy

Extract the Golden Path:

- Problem context and verified commands.
- Prerequisites and runtime secret retrieval. Never write secret values.
- Exact searchable error signatures.
- Decisions, trade-offs, and remaining uncertainty.

Delete conversational filler and raw transcripts.

## Topic Graph Structure

Organize by topic before evidence. The topic hub is the middle context node between a project anchor and its deep dives:

```text
Project Anchor ──► Topic Hub ──► Deep-Dive Notes
```

Rules:

- Create the topic hub first before any deep-dive notes: states scope, decisions, and child links.
- Keep folders shallow: nest the graph with `[[wikilinks]]`, not deeper directories.
- Every child note includes a parent link: `Part of: [[Topic Hub]]`.
- Group related proposal candidates by topic before asking for confirmation.
- See [`references/topic-graph.md`](references/topic-graph.md) for hierarchy details.

## Proposal Gate (REQUIRED)

Never write notes without presenting the proposal table first. Group related candidates by topic:

| # | Score | Topic Hub | Archetype | Suggested Path | Captures |
|:---:|:---:|---|---|---|---|
| 1 | 4★ | [[Topic Hub]] | System Map | Projects/Deep Dive.md | Verified evidence and decision |

Reply with all, selected numbers, or redirect paths. Wait for confirmation before creating notes.

## Universal Invariants

- **Secrets:** NEVER write plaintext passwords, tokens, cookies, or credentials. Show runtime retrieval:

  ```bash
  kubectl -n <namespace> get secret <name> -o jsonpath='{.data.KEY}' | base64 --decode; echo
  ```

- **Actions**: keep one code block per action and make commands copy-paste ready.
- **Verification**: run `markdown-quality` on every note until the review reports `CLEAN`.

## Rationalizations & Red Flags

| Excuse | Reality |
| --- | --- |
| "This is only one note" | Create the topic hub when material has related deep dives. |
| "I'll write children now and hub later" | Create the hub first. Context makes child notes useful. |
| "The review is optional" | `markdown-quality` is the completion gate. |

Red flags:

- Deep-dive note has no parent topic hub.
- Secrets or raw credentials appear in a note.
- `markdown-quality` does not report `CLEAN`.

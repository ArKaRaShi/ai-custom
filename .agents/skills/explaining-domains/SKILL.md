---
name: explaining-domains
description: Explaining unfamiliar domains. Use when a reader without the background gets lost, such as equipment, a calculation pipeline, an unfamiliar area of a codebase, a legal or financial process, or jargon-heavy output. Readers who already know the domain get `how` or `why` instead.
---

# Explaining Domains

Produces an explanation shaped to one reader, one domain and one question. The rules have no fixed order: weigh each, skip any that adds nothing for this question, and decide the story's shape yourself.

## Rules

- Decide three things before writing: what the reader must leave knowing, what they already know, and the smallest concrete case that illustrates the idea. Let them choose the structure of the story.
- Choose a spine that fits the domain and the question: something travelling through stages, a before and after, a chain of causes, a comparison, a failure and its repair. Use none when the question has one fact as its answer.
- Lead with one sentence of conclusion made only of words the reader already has.
- Offer an anchor when a familiar thing works the same way, and say where the picture breaks. Skip it when no honest match exists.
- Define each term where it first appears: plain meaning, unit if it has one, a normal value. Show at most 4 new terms in one section.
- Follow one concrete case end to end rather than describing the system in general.
- Put real numbers on that case. Label made-up inputs, and say whether each result came from code, a run, a source document, or hand arithmetic.
- Ask for a guess before a result whose direction is not obvious, then reveal the answer. Skip it when the reader would expect the answer.
- Show the key fact at more than one level (picture, numbers, rule) when the reader needs the link between them. Start at the level where the reader already stands.
- For a difference between two versions, say which way one example number moves and by how much.
- Keep every term defined on screen. Run `bun scripts/term-audit.ts <screen-file> --glossary <terms-file>` and define what it lists. It exits 1 when any term lacks a definition. Requires Bun 1.4 or later.
- Cut anything the question did not ask for. Move the rest into one collapsed section.
- State what you did not check.
- Collect facts first with `how` (how it works) or `why` (design reasons). This skill shapes them, and the `visual-companion` Understand workflow renders them.

| The reader says | Weigh |
| --- | --- |
| "I don't know these words" | terms defined where used, term audit |
| "I can't see how it fits" | anchor, one case |
| "I get the parts, not the whole" | spine, one case end to end |
| "Why does this matter?" | numbers on the case, direction of change |
| "I read it and forgot" | guess first, fewer new terms per section |

## Example

```text
// Avoid: "The index is a B-tree, so lookups are O(log n)."
// Prefer: "An index is the tab strip on a phone book: you jump near the name instead of reading every page.
// Finding one name among a million takes about 20 jumps instead of a million page turns."
```

## The tests

- Could the reader act on the first sentence without reading further?
- Does every term that is not everyday English have a definition on screen?
- Can the reader say which way a number moves, and why?
- Did the page say what it did not check?
- Does the explanation stop where the reader's question stops?

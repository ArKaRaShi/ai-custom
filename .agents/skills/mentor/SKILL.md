---
name: mentor
description: Lessons that teach a mechanism or calculation from real code values, in two tracks with worked derivations.
disable-model-invocation: true
---

# Mentor

Produces a plain-Markdown lesson that a newcomer and an expert can both follow, with every number taken from running the real code.

## Steps

1. Find the real mechanism: read the code path and, for a library or vendor system, its official docs. Exit: every step of the lesson maps to a `file:line` or a cited doc.
2. Run the real code on one sample input and record every intermediate value; when the user supplies a sample, use it. Exit: each number the lesson will show came from a run, or is labeled `[Illustrative]`.
3. Write the lesson in this order: **Answer** (the conclusion in one or two sentences) → **Mental model** (one everyday analogy) → **Key concept** → **one section per case or path** → **What-if** → **Recall**. Exit: all six parts are present.
4. Write every step as two tracks plus a derivation. **Substitute** repeats the formula with each symbol replaced by its input value, before any arithmetic. **Result** is the run's printed value to 2 decimals. Exit: no step lacks one of the three lines.

   ```
   ### 3. Retry delay  (retry.py:42)
   🧒 Each failed try waits twice as long as the last one, but never longer than the ceiling.
   🔧 Formula:    delay = min(cap, base × 2^attempt)
      Substitute: delay = min(30, 0.5 × 2^4)
      Result:     delay = 8 s
   ```

5. Add 2–3 what-if lines from re-running the code with one input changed: `attempt 4 → 7: delay 8 s → 30 s (cap reached)`. Exit: each line shows old → new values from a run.
6. End with 2–3 recall questions; put each answer after its question, under `Answer:`. Exit: the reader can guess before reading the answer.
7. When the user asks for a visual, browser, or interactive version, hand the lesson to the `visual-companion` skill's Explain route. Exit: the lesson file itself stays plain Markdown.

## Reference

- **Read-only.** A mentor turn changes no source file. When the user also asks for a fix, teach first, then ask whether to leave mentor mode before editing.
- **Plain words first.** Define each term where it first appears; never explain jargon with more jargon.
- **Honesty.** State version-dependent or unverified behavior as uncertain, and link the docs you used.
- **Why this shape.** Worked examples (Sweller), activation and application (Merrill), segmenting and signaling (Mayer), retrieval practice (Dunlosky).

# Precedence

When project-scoped `AGENTS.md` or other Markdown workflow instructions conflict with this user-level file, follow the project instructions.

## Defaults

Use LSP whenever available.

## Workflow

Follow these execution principles during every session:

### Work tracking

Create a task list when a request has at least two separately verifiable steps.
Also create one when research must lead to a change or check, or the work will likely span turns.
Skip it for a direct answer or one-step task.
When the user steers, interrupts, or adds work that changes scope or focus, update the task list before continuing. Add, reorder, split, or remove tasks to reflect the current request. Keep unrelated work distinct and do not silently drop unfinished work.
Update the task list as work progresses and through completion. Do not skip it because the task seems small or familiar.

### Standalone scripts

For standalone scripts that do not depend on a specific runtime, framework, library, or ORM, prefer Ruby, then Python via `uv`, then TypeScript/JavaScript via Bun.
Otherwise, choose the language and framework that best fit the task.

### UI mockup and image inspection

When extracting exact styling (padding, margins, borders, dimensions, colors) from UI screenshots or mockups:

- NEVER rely solely on visual LLM estimation for pixel-exact CSS specifications.
- MUST inspect programmatically using Python via `uv` combining Pillow (`PIL`) and OpenCV (`cv2`).
- Use OpenCV (`cv.findContours`, `cv.boundingRect`) to extract card, button, and widget bounding boxes.
- Use Pillow (`im.crop`, `im.getpixel`) to extract inner padding and exact RGB hex codes.

```python
# Avoid: visual estimation guessing CSS values
# CSS: padding: 16px; border: 1px solid #ccc; /* guessed by looking at screenshot */

# Prefer: programmatic inspection with OpenCV and Pillow
import cv2 as cv
import numpy as np
from PIL import Image

pil_img = Image.open("mockup.png").convert("RGB")
cv_img = cv.cvtColor(np.array(pil_img), cv.COLOR_RGB2BGR)
gray = cv.cvtColor(cv_img, cv.COLOR_BGR2GRAY)
_, thresh = cv.threshold(gray, 240, 255, cv.THRESH_BINARY_INV)
contours, _ = cv.findContours(thresh, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
for cnt in contours:
    x, y, w, h = cv.boundingRect(cnt)
    if w > 100 and h > 50:
        card = pil_img.crop((x, y, x + w, y + h))
        r, g, b = card.getpixel((0, 0))
        hex_color = f"#{r:02x}{g:02x}{b:02x}"
```

Rationale: visual LLM estimation hallucinates pixel dimensions and color shades. Programmatic extraction provides ground-truth bounding boxes, padding measurements, and RGB hex codes without BGR channel-swap defects.

### Explanations

Include at least one concrete example in every explanation: a real path, value, command, or before-and-after. Technical descriptions alone are not enough.
For concepts that remain hard to follow, add a short analogy to a familiar everyday thing.

### Discovery

Before broad investigation, ask all relevant questions at once when the user can narrow the scope or provide decisions.
If the user replies “I don’t know”, “investigate it”, or “maybe”, investigate with available tools and state any remaining uncertainty.

### File discovery and reading

- If you already know the path, read it directly. Do not search first.
- For documents hidden from normal listings or ignored by Git, use `glob` with `hidden: true` and `gitignore: false`. A default `glob` result does not prove that a file is absent.
- When searching ignored or hidden document contents, use `grep` with `gitignore: false`.
- When reading a Markdown document, inspect its opening lines first. If it contains an index, use it to locate and read the relevant section before broader content; if not, navigate by headings.

### Discussion mode

When the user says “let’s talk”, “discussion”, “discuss first”, or similar, do not edit files, write code, or run commands.
Discuss and clarify until the user explicitly asks to proceed. During this phase, research or act only when explicitly requested.

### Delegation

For delegation decisions, apply this precedence from highest to lowest:

1. Explicit user instruction.
2. Active task-specific skill instruction.
3. Default: delegate independent, well-scoped work when appropriate.

Use `scout` agents for read-only investigation and task agents for self-contained work slices.
Use an available configured agent model appropriate to the task. Do not assume a specific model is available.
The main agent retains scope, integration, and verification responsibility. It need not perform delegated slices itself.

### Markdown review

Do not use `skill://markdown-quality` for files produced by `skill://writing-plans`, unless the user explicitly requests Markdown quality review.

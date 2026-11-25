# Standards

Contracts shared by every harness on this Mac. One topic per file. Each one is
enforced by a hook or a test; none relies on an agent remembering to read it.

| Standard | Trigger | Enforced by (omp) |
| --- | --- | --- |
| [working-with-image](working-with-image.md) | reading, cropping, screenshotting, or measuring any image | — |
| [authoring-hooks](authoring-hooks.md) | writing or editing a file under `hooks/{pre,post}/` | — |

A dash means no adapter yet: the standard is stated, but nothing in that harness fails
when an agent skips it. Replace the dash in the same change that adds the adapter.

Adding a standard: one file here, one row above, and one hook or test that enforces it.

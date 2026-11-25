# Working with images

Applies to any image an agent reads, crops, screenshots, or measures: PNG, JPEG, WebP,
GIF, and SVG rendered to pixels. These rules describe the pixels a harness delivers,
not one harness's tool names.

## What you receive is not the file

An image read arrives after two edits, neither visible in the path:

- **Resampled.** A wide image shrinks to roughly 1568 px. Every coordinate in the
  delivered frame maps back through the multiplier the harness prints, for example
  `original 2560x1664, displayed at 1568x1019, multiply coordinates by 1.63`.
- **Re-encoded.** A lossy WebP may stand in for the PNG on disk, and small text loses
  strokes in that step.

So:

- Never quote a coordinate, padding, border, or colour read off the delivered frame as
  the file's value. Convert with the printed multiplier or measure the file.
- Never claim to have read text you cannot see. Crop the region at native resolution
  first, then read the crop.

## Measure on the original

One supported way, against the file on disk:

```bash
uv run --with pillow python - <<'PY'
from PIL import Image

image = Image.open("shot.png").convert("RGB")
print(image.size)
image.crop((40, 120, 480, 200)).save("/tmp/shot.crop.status-row.png")
print(image.getpixel((48, 136)))  # (r, g, b)
PY
```

That value is RGB. OpenCV reads BGR, so convert with `cv.COLOR_BGR2RGB` or
`cv.COLOR_RGB2BGR` before comparing against a design token or a number from the script
above; a hex value derived without the conversion is wrong in a way that still looks
plausible.

Bounding boxes come from detection, not estimation: threshold, `findContours`,
`boundingRect`. A card's padding is the distance between its border box and its content
box in the original file, not a guess made by looking at a thumbnail.

## A crop is a new path

Reading the same path twice does not show the image again: the repeat is deduplicated
to a note. A later read of the same file may show `Superseded by a newer read of this
file`. Both are context policy, not failures.

Read once, write down what you saw as text, and crop to a new filename when you need a
closer look: measure, crop, then read. A claim that must survive pruning belongs in
your reply, not in an image you will not be shown again.

## Selectors

A raster image takes no selector. A line range, `:img`, or `:raw` on a PNG is ignored
at best and an error at worst; only SVG needs `:img` to rasterise. Reading a directory
of frames lists their names; it does not show them.

## Screenshots

- Create the file and read it in the same step, with an absolute path. A screenshot
  written by one call and read by a later one is a stale path waiting to fail; check
  that the path exists before claiming it does.
- Apply the capture scale the harness prints. A 2x capture displayed at 1x moves a
  guessed click to half its intended position.
- A browser that reports its tab is not visible will not produce a screenshot. Bring
  the tab to the front, or capture from the handle that owns the page.

## An image the user pasted

It is evidence of what the user sees: quote it, treat it as the requirement, and do not
measure it. When a number matters, produce it from the file or the page, never from the
attachment's pixels.

## Enforced by

| Harness | Adapter | Category |
| --- | --- | --- |
| omp | — | — |
| claude-code | — | — |

A dash means the standard is stated but nothing in that harness fails when an agent
skips it. Replace the dash when an adapter lands.

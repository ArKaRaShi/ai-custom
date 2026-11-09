import { SaxesParser } from "saxes";

// Only inert drawing elements are accepted; SVG can otherwise embed HTML, scripts, or remote resources.
const ELEMENTS: Record<string, true> = Object.fromEntries(
  ["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "title", "desc"].map((name) => [name, true]),
);
const ATTRIBUTES: Record<string, true> = Object.fromEntries(
  [
    "xmlns",
    "viewBox",
    "width",
    "height",
    "x",
    "y",
    "x1",
    "x2",
    "y1",
    "y2",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "d",
    "points",
    "fill",
    "fill-opacity",
    "fill-rule",
    "stroke",
    "stroke-width",
    "stroke-opacity",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-dasharray",
    "opacity",
    "transform",
    "font-family",
    "font-size",
    "font-weight",
    "text-anchor",
    "dominant-baseline",
    "role",
    "aria-label",
    "aria-hidden",
  ].map((name) => [name, true]),
);

/** Reject rather than modify markup: the CLI and browser must see the same illustration. */
export function svgError(markup: string): string | undefined {
  let error: string | undefined;
  let roots = 0;
  let depth = 0;
  const parser = new SaxesParser({ xmlns: false });
  parser.on("doctype", () => {
    error ??= "doctype is not allowed";
  });
  parser.on("processinginstruction", () => {
    error ??= "processing instructions are not allowed";
  });
  parser.on("comment", () => {
    error ??= "comments are not allowed";
  });
  parser.on("cdata", () => {
    error ??= "CDATA is not allowed";
  });
  parser.on("opentag", (tag) => {
    if (depth === 0 && (++roots !== 1 || tag.name !== "svg")) error ??= "one svg root is required";
    depth++;
    if (!Object.hasOwn(ELEMENTS, tag.name)) error ??= `element ${tag.name} is not allowed`;
    for (const [name, value] of Object.entries(tag.attributes)) {
      if (!Object.hasOwn(ATTRIBUTES, name)) error ??= `attribute ${name} is not allowed`;
      if (name === "xmlns" && value !== "http://www.w3.org/2000/svg") error ??= "invalid svg namespace";
      if (name !== "xmlns" && /url\s*\(|javascript\s*:|\\|((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i.test(value))
        error ??= `unsafe value in ${name}`;
    }
  });
  parser.on("closetag", () => {
    depth--;
  });
  try {
    parser.write(markup).close();
  } catch {
    error ??= "invalid SVG markup";
  }
  return error ?? (roots === 1 ? undefined : "one svg root is required");
}

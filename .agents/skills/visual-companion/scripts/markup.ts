/*
 * markup.ts: one small HTML tokenizer and one lint, both pure.
 *
 * The tokenizer is what the spacing test used to carry privately. It tracks tag, attributes
 * and line number, and ignores comments, <style> and <script> bodies. `lintMarkup` is where
 * the catalogue's authoring contract becomes checkable: it is the consumer that turns "the
 * catalogue is the source of truth" from a convention into a failure.
 */
import { authoringNames, type Catalogue, elementEntries, knownNames } from "./catalogue";
import { DIAGRAM_KINDS } from "../assets/components/layout/kinds.js";

export interface MarkupNode {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly classes: readonly string[];
  /** The style attribute with all whitespace removed. */
  readonly style: string;
  readonly line: number;
  /** Text content, including text in descendants, in document order. */
  text: string;
  readonly children: MarkupNode[];
}

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
  "path", "circle",
]);

const TAG = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function blank(match: string): string {
  return match.replace(/[^\n]/g, "");
}

export function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [, name, quoted, single, bare] of raw.matchAll(ATTRIBUTE)) {
    attrs[(name ?? "").toLowerCase()] = quoted ?? single ?? bare ?? "";
  }
  return attrs;
}

export function parseMarkup(source: string): MarkupNode {
  const cleaned = source
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/<style[\s\S]*?<\/style>/gi, blank)
    .replace(/<script[\s\S]*?<\/script>/gi, blank);

  const root: MarkupNode = { tag: "#root", attrs: {}, classes: [], style: "", line: 0, text: "", children: [] };
  const stack: MarkupNode[] = [root];
  TAG.lastIndex = 0;
  let match: RegExpExecArray | null;
  let textStart = 0;

  while ((match = TAG.exec(cleaned)) !== null) {
    const text = cleaned.slice(textStart, match.index);
    for (const ancestor of stack) ancestor.text += text;
    textStart = TAG.lastIndex;
    const [, closing, rawTag, rawAttrs, selfClosing] = match;
    const tag = (rawTag ?? "").toLowerCase();
    if (closing) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i]?.tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const attrs = parseAttributes(rawAttrs ?? "");
    const node: MarkupNode = {
      tag,
      attrs,
      classes: (attrs["class"] ?? "").split(/\s+/).filter(Boolean),
      style: (attrs["style"] ?? "").replace(/\s+/g, ""),
      line: cleaned.slice(0, match.index).split("\n").length,
      text: "",
      children: [],
    };
    stack[stack.length - 1]?.children.push(node);
    if (!VOID.has(tag) && !selfClosing) stack.push(node);
  }
  const remaining = cleaned.slice(textStart);
  for (const ancestor of stack) ancestor.text += remaining;
  return root;
}

export function walk(node: MarkupNode, visit: (node: MarkupNode) => void): void {
  for (const child of node.children) {
    visit(child);
    walk(child, visit);
  }
}

export interface Finding {
  readonly line: number;
  readonly rule: "unknown-class" | "unknown-element" | "unknown-attr" | "unresolved-for" | "unresolved-at" | "unresolved-term" | "unresolved-edge" | "unresolved-node" | "small-svg-text" | "duplicate-position-control";
  readonly message: string;
}

/** Attributes any element may carry without being listed in the catalogue. */
const GLOBAL_ATTRS = new Set(["id", "class", "style", "hidden", "title", "lang", "dir", "slot", "role", "tabindex"]);


function termKey(value: string): string {
  const entities: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
  const decoded = value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, name: string) => {
    if (!name.startsWith("#")) return entities[name.toLowerCase()] ?? entity;
    const hex = name[1]?.toLowerCase() === "x";
    const code = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "\ufffd";
  });
  return decoded.toLowerCase().replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "").trim();
}

/** Extract node identifiers from the supported text-source diagram grammars. */
function diagramNodesFromSource(source: string): Set<string> {
  const ids = new Set<string>();
  const lines = source.split("\n");
  const first = lines.map((line) => line.replace(/%%.*$/, "").trim()).find(Boolean) ?? "";
  const declared = first.replace(/^kind:\s*/, "");
  const kind = DIAGRAM_KINDS.includes(declared) ? declared : "flow";
  for (const raw of lines) {
    const line = raw.replace(/%%.*$/, "").trim();
    if (!line || DIAGRAM_KINDS.includes(line) || /^kind:\s*\S+\s*$/.test(line) || /^(?:graph|flowchart)(?:\s|$)/i.test(line)) continue;
    if (kind === "sequence") {
      const participant = /^participant\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(line);
      const message = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:->>|-->|->)\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(line);
      if (participant) ids.add(participant[1]!);
      if (message) {
        ids.add(message[1]!);
        ids.add(message[2]!);
      }
      continue;
    }
    if (kind === "state") {
      const node = String.raw`(?:\[\*\]|[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]]*\]|\([^)]*\))?)`;
      const transition = new RegExp(`^(${node})\\s*-->\\s*(?:\\|[^|]+\\|\\s*)?(?:@[A-Za-z]+\\s+)?(${node})`).exec(line);
      const declarations = transition ? transition.slice(1) : [line];
      for (const declaration of declarations) {
        const id = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(declaration ?? "");
        if (id) ids.add(id[1]!);
      }
      continue;
    }
    let rest = kind === "tree" ? line.replace(/^[-*]\s+/, "") : line;
    while (rest) {
      const node = /^([A-Za-z_][A-Za-z0-9_]*)(?:\[[^\]]*\]|\([^)]*\))?(?::::(?:ok|warn|danger))?/.exec(rest);
      if (!node) break;
      ids.add(node[1]!);
      rest = rest.slice(node[0].length).trimStart();
      const edge = /^(?:-->|---|-\.->)\s*(?:\|[^|]*\|\s*)?(?:@[A-Za-z]+\s+)?/.exec(rest);
      if (!edge) break;
      rest = rest.slice(edge[0].length).trimStart();
    }
  }
  return ids;
}

function fontSize(node: MarkupNode): number | null {
  const inline = /(?:^|;)\s*font-size\s*:\s*([^;]+)/i.exec(node.attrs["style"] ?? "");
  const raw = (inline?.[1] ?? node.attrs["font-size"] ?? "").trim();
  const match = /^(\d+(?:\.\d+)?|\.\d+)(?:px)?$/i.exec(raw);
  return match ? Number(match[1]) : null;
}
/**
 * Pure; never throws on malformed HTML, reports what it can see.
 *   unknown-class    class="vc-..." that is no entry name, part or internal name
 *   unknown-element  <vc-...> that is no element entry or part
 *   unknown-attr     attribute on an element entry that its entry does not list
 *   unresolved-for   for="x" on a vc element with no <vc-tabs id="x"> in the same source
 *   unresolved-at    vc-tab at="x" names no node in a diagram bound to its tabs
 *   unresolved-term  vc-term has no non-empty first definition in a vc-term or glossary
 *   unresolved-edge  diagram edge endpoint names no node in the same diagram
 *   unresolved-node  vc-term data-node names no diagram node on the page
 *   small-svg-text   SVG text in a diagram has an explicit font size below 12 user units
 * Parts (vc-tab) are legal tags but carry no attribute list of their own.
 */
export function lintMarkup(source: string, catalogue: Catalogue): readonly Finding[] {
  const findings: Finding[] = [];
  const classes = knownNames(catalogue);
  const tags = authoringNames(catalogue);
  const elements = new Map(elementEntries(catalogue).flatMap((entry) => entry.names.map((name) => [name, entry] as const)));

  const tabsIds = new Set<string>();
  const definitions = new Map<string, boolean>();
  const diagramNodes = new Map<string, Set<string>>();
  const nodesByDiagram = new Map<MarkupNode, Set<string>>();
  const pageNodes = new Set<string>();
  const root = parseMarkup(source);
  const visibleTabs = new Set<string>();
  const collectVisible = (node: MarkupNode, hidden: boolean): void => {
    const invisible = hidden || "hidden" in node.attrs || /(?:^|;)display:none(?:;|$)/i.test(node.style);
    if (!invisible && node.tag === "vc-tabs" && !("hide-tabs" in node.attrs) && node.attrs["id"]) visibleTabs.add(node.attrs["id"]);
    for (const child of node.children) collectVisible(child, invisible);
  };
  collectVisible(root, false);
  walk(root, (node) => {
    if (node.tag === "vc-tabs" && node.attrs["id"]) tabsIds.add(node.attrs["id"]);
    if (node.tag !== "vc-diagram") return;
    const ids = new Set<string>();
    const collectNodes = (parent: MarkupNode): void => {
      for (const child of parent.children) {
        if (child.tag === "vc-diagram") continue;
        const id = child.attrs["data-node"];
        if (id && child.tag !== "vc-term" && child.tag !== "vc-tab") ids.add(id);
        collectNodes(child);
      }
    };
    collectNodes(node);
    if (node.children.length === 0) {
      const flowIds = diagramNodesFromSource(node.text);
      for (const id of flowIds) ids.add(id);
    }
    nodesByDiagram.set(node, ids);
    for (const id of ids) pageNodes.add(id);
    const target = node.attrs["for"];
    if (target) {
      const boundIds = diagramNodes.get(target) ?? new Set<string>();
      for (const id of ids) boundIds.add(id);
      diagramNodes.set(target, boundIds);
    }
  });
  const collectDefinitions = (parent: MarkupNode): void => {
    for (let i = 0; i < parent.children.length; i++) {
      const node = parent.children[i]!;
      let definition: string | undefined;
      if (node.tag === "vc-term") definition = node.attrs["def"];
      else if (parent.tag === "dl" && node.tag === "dt" && parent.children[i + 1]?.tag === "dd") {
        definition = parent.children[i + 1]!.text;
      }
      if (definition !== undefined) {
        const text = node.tag === "vc-term" ? node.attrs["term"] ?? node.text : node.text;
        const key = termKey(text);
        if (!definitions.has(key)) definitions.set(key, !!definition.trim());
      }
      collectDefinitions(node);
    }
  };
  collectDefinitions(root);

  const checkRelations = (node: MarkupNode, tabs: MarkupNode | null, diagramOwner: MarkupNode | null, inSvg: boolean, inheritedSize: number | null): void => {
    const owner = node.tag === "vc-tabs" ? node : tabs;
    const diagram = node.tag === "vc-diagram" ? node : diagramOwner;
    const svg = !!diagram && (inSvg || node.tag === "svg");
    const size = svg ? fontSize(node) ?? inheritedSize : null;
    if (node.tag === "vc-tab" && node.attrs["at"] !== undefined) {
      const target = node.attrs["at"];
      const id = owner?.attrs["id"];
      const nodes = id ? diagramNodes.get(id) : undefined;
      if (!nodes?.has(target)) {
        findings.push({ line: node.line, rule: "unresolved-at", message: `at="${target}" names no node in a diagram bound to its <vc-tabs>` });
      }
    }
    const key = node.tag === "vc-term" ? termKey(node.attrs["term"] ?? node.text) : "";
    if (node.tag === "vc-term" && !definitions.get(key)) {
      findings.push({ line: node.line, rule: "unresolved-term", message: "<vc-term> has no matching definition" });
    }
    if (diagram) {
      const ids = nodesByDiagram.get(diagram);
      for (const attr of ["data-from", "data-to"]) {
        const id = node.attrs[attr];
        if (id !== undefined && !ids?.has(id)) {
          findings.push({ line: node.line, rule: "unresolved-edge", message: `${attr}="${id}" names no node in the same diagram` });
        }
      }
    }
    if (node.tag === "vc-term" && node.attrs["data-node"] !== undefined) {
      const id = node.attrs["data-node"];
      if (!pageNodes.has(id)) {
        findings.push({ line: node.line, rule: "unresolved-node", message: `data-node="${id}" names no diagram node on the page` });
      }
    }
    if (svg && node.tag === "text" && size !== null && size < 12) {
      findings.push({ line: node.line, rule: "small-svg-text", message: "diagram SVG text has a font size below 12" });
    }
    for (const child of node.children) checkRelations(child, owner, diagram, svg, size);
  };
  checkRelations(root, null, null, false, null);

  walk(root, (node) => {
    for (const name of node.classes) {
      if (name.startsWith("vc-") && !classes.has(name)) {
        findings.push({ line: node.line, rule: "unknown-class", message: `class "${name}" is not in the catalogue` });
      }
    }
    if (!node.tag.startsWith("vc-")) return;
    if (!tags.has(node.tag)) {
      findings.push({ line: node.line, rule: "unknown-element", message: `<${node.tag}> is not in the catalogue` });
      return;
    }
    const target = node.attrs["for"];
    if (node.tag === "vc-scrub" && target && visibleTabs.has(target)) {
      findings.push({ line: node.line, rule: "duplicate-position-control", message: `vc-scrub and visible tabs both control "${target}"` });
    }
    if (target !== undefined && !tabsIds.has(target)) {
      findings.push({ line: node.line, rule: "unresolved-for", message: `for="${target}" names no <vc-tabs id>` });
    }
    const entry = elements.get(node.tag);
    if (!entry) return;
    for (const name of Object.keys(node.attrs)) {
      const free = GLOBAL_ATTRS.has(name) || name.startsWith("data-") || name.startsWith("aria-");
      if (!free && !(name in entry.attrs)) {
        findings.push({ line: node.line, rule: "unknown-attr", message: `<${node.tag}> has no attribute "${name}"` });
      }
    }
  });
  return findings;
}

import { DIAGRAM_KINDS, EDGE_KINDS } from "./layout/kinds.js";
import { parseKind } from "./layout/grammars.js";
import { layoutFlow } from "./layout/flow.js";
import { layoutTree } from "./layout/tree.js";
import { layoutState } from "./layout/state.js";
import { layoutSequence, routeSequence } from "./layout/sequence.js";
import { routeFlow } from "./layout/routing.js";

/*
 * The first line may name the kind: flow, tree, sequence or state (also `kind: tree`). Tree,
 * sequence and state sources are parsed by layout/grammars.js. Offline flowchart subset, one
 * chain per line:
 *   header: graph | flowchart, optionally followed by LR, TB or TD (default LR; TD means TB)
 *   chain:  node (edge node)*
 *   node:   ID followed immediately by optional [label] or (label), then optional :::ok,
 *           :::warn or :::danger; ID matches [A-Za-z_][A-Za-z0-9_]*
 *   edge:   -->, --- or -.->, optionally followed by |label|
 * Blank lines and text after %% are ignored. Labels are plain text and may not be empty;
 * node labels cannot contain brackets, parentheses or braces. The first explicit label wins.
 * Other Mermaid syntax, including subgraphs, styles and other shapes or arrows, is rejected
 * with a line-numbered error. Diagrams are limited to 24 nodes.
 */
export const MAX_NODES = 24;

export function parseFlow(source) {
  const firstLine = source.split(/\r?\n/).map((line) => line.replace(/%%.*$/, "").trim()).find(Boolean);
  const declaredKind = /^(?:kind:\s*)?(\S+)$/.exec(firstLine || "")?.[1];
  if (declaredKind && declaredKind !== "flow" && DIAGRAM_KINDS.includes(declaredKind)) return parseKind(source, declaredKind, MAX_NODES);
  const nodes = new Map();
  const edges = [];
  const errors = [], problems = [];
  let dir = "LR";
  let seenContent = false;
  let first = true;
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const line = text.replace(/%%.*$/, "").trim();
    if (!line) continue;
    const fail = (why) => errors.push({ line: i + 1, text, why });
    const declared = first && /^kind:\s*(\S+)\s*$/.exec(line);
    const kind = declared?.[1] || (first && DIAGRAM_KINDS.includes(line) ? line : null);
    if (kind) {
      if (!DIAGRAM_KINDS.includes(kind)) fail(`Unknown diagram kind: ${kind}. Use ${DIAGRAM_KINDS.slice(0, -1).join(", ")} or ${DIAGRAM_KINDS.at(-1)}.`);
      first = false; continue;
    }
    first = false;
    const header = /^(?:graph|flowchart)(?:\s+(LR|TB|TD))?\s*$/.exec(line);
    if (header) {
      if (seenContent) fail("The graph header must appear first.");
      else { dir = header[1] === "TB" || header[1] === "TD" ? "TB" : "LR"; seenContent = true; }
      continue;
    }
    seenContent = true;
    let pos = 0;
    const additions = [];
    const newEdges = [];
    const space = () => { while (/\s/.test(line[pos] || "") && pos < line.length) pos++; };
    const node = () => {
      space();
      const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(line.slice(pos))?.[0];
      if (!id || /^(?:subgraph|end|style|classDef|class|click|linkStyle|direction)$/.test(id)) return null;
      pos += id.length;
      let label = id, shape = "rect", explicit = false;
      if (line[pos] === "[" || line[pos] === "(") {
        const close = line[pos] === "[" ? "]" : ")";
        shape = line[pos] === "(" ? "pill" : "rect";
        const end = line.indexOf(close, pos + 1);
        if (end < 0) return null;
        label = line.slice(pos + 1, end).trim();
        if (!label || /[\[\](){}]/.test(label)) return null;
        explicit = true;
        pos = end + 1;
      }
      let tone = null;
      if (line.startsWith(":::", pos)) {
        const match = /^:::(ok|warn|danger)\b/.exec(line.slice(pos));
        if (!match) return null;
        tone = match[1]; pos += match[0].length;
      }
      additions.push({ id, label, shape, tone, explicit });
      return id;
    };
    let from = node();
    let valid = !!from;
    while (valid) {
      space();
      if (pos === line.length) break;
      const arrow = /^(-->|---|-\.->)/.exec(line.slice(pos))?.[0];
      if (!arrow) { valid = false; break; }
      pos += arrow.length;
      space();
      let label = null;
      if (line[pos] === "|") {
        const end = line.indexOf("|", pos + 1);
        if (end < 0 || !line.slice(pos + 1, end).trim()) { valid = false; break; }
        label = line.slice(pos + 1, end).trim(); pos = end + 1;
      }
      space();
      let kind = null;
      if (line[pos] === "@") {
        const match = /^@([A-Za-z]+)\s+/.exec(line.slice(pos));
        if (!match || !Object.hasOwn(EDGE_KINDS, match[1])) { valid = false; break; }
        kind = match[1]; pos += match[0].length;
      }
      const to = node();
      if (!to) { valid = false; break; }
      newEdges.push({ from, to, label, style: arrow === "-.->" ? "dotted" : "solid", arrow: arrow !== "---", ...(kind ? { kind } : {}) });
      from = to;
    }
    if (!valid) { fail("Unsupported or invalid flowchart syntax."); continue; }
    for (const item of additions) {
      const previous = nodes.get(item.id);
      if (!previous) nodes.set(item.id, item);
      else if (!previous.explicit && item.explicit) nodes.set(item.id, item);
      else if (previous.explicit && item.explicit) problems.push(`Duplicate node: ${item.id}.`);
      else if (!previous.tone && item.tone) previous.tone = item.tone;
    }
    for (const edge of newEdges) {
      if (edge.from === edge.to) problems.push(`Self edge: ${edge.from}.`);
      else edges.push(edge);
    }
    if (nodes.size > MAX_NODES) { fail(`Maximum ${MAX_NODES} nodes; split the diagram.`); break; }
  }
  const graph = { kind: "flow", dir, nodes: Array.from(nodes.values(), ({ explicit, ...node }) => node), edges, problems };
  return errors.length ? { ok: false, errors } : { ok: true, graph };
}


export function markerPosition(at, rects) {
  const rect = at == null ? null : rects.get(at);
  return rect ? { x: rect.x, y: rect.y } : null;
}

const SVG_NS = "http://www.w3.org/2000/svg";
let diagramNumber = 0;

const LAYOUTS = { flow: layoutFlow, tree: layoutTree, sequence: layoutSequence, state: layoutState };

/**
 * Kinds that lay out top-down. An edge label hangs beside a vertical line there, so the gap between
 * lanes is sized from the widest label (plus this much clearance) instead of left at a fixed width.
 */
const LANE_LABELS = new Set(["tree", "state"]);
const LANE_PAD = 24;

export function readGraph(root, allowSelf = false) {
  const nodes = new Map(), edges = [], problems = [];
  for (const el of root.querySelectorAll("[data-node]")) {
    const id = (el.getAttribute("data-node") || "").trim();
    if (!id || nodes.has(id)) { problems.push(`Duplicate or empty node id: ${id}.`); continue; }
    nodes.set(id, { id, el, label: el.getAttribute("aria-label") || el.textContent.trim() || id });
  }
  for (const el of root.querySelectorAll("[data-from][data-to]")) {
    const from = el.getAttribute("data-from"), to = el.getAttribute("data-to");
    if (!nodes.has(from) || !nodes.has(to)) { problems.push(`Unknown node in edge: ${from} → ${to}.`); continue; }
    if (from === to && !allowSelf) { problems.push(`Self edge: ${from}.`); continue; }
    const kind = el.getAttribute("data-kind") || "default";
    if (!Object.hasOwn(EDGE_KINDS, kind)) { problems.push(`Unknown line kind: ${kind}.`); continue; }
    edges.push({ from, to, kind, el });
  }
  return { nodes, edges, problems };
}

export function reach(graph, id, direction) {
  const depth = new Map([[id, 0]]), queue = [id];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    for (const edge of graph.edges) {
      if (edge.kind === "return") continue;
      const from = direction === "down" ? edge.from : edge.to;
      const to = direction === "down" ? edge.to : edge.from;
      if (from === current && !depth.has(to)) {
        depth.set(to, depth.get(current) + 1);
        queue.push(to);
      }
    }
  }
  const edges = graph.edges.filter((edge) => edge.kind !== "return" && depth.has(edge.from) && depth.has(edge.to));
  return { depth, edges };
}

export class VcDiagram extends HTMLElement {
  #stage; #marker; #caption; #graph; #layout; #paths = []; #labels = []; #lifelines = [];
  #anchors = new Map(); #tabs = null; #observer = null; #lookupObserver = null;
  #generation = 0; #warned = new Set(); #art = false; #laneGap = "";
  #network; #selected = null; #status; #up; #down; #clearButton; #badges = []; #geometry;
  #onKey = (event) => { if (event.key === "Escape") this.#clearSelection(); };
  #onTermIn = (event) => this.#link(event, true);
  #onTermOut = (event) => this.#link(event, false);
  #onChange = () => this.#draw();
  #onReady = () => this.#bind();

  connectedCallback() {
    if (!this.dataset.ready) this.#render();
    if (!this.#stage) return;
    const generation = ++this.#generation;
    if (typeof ResizeObserver !== "undefined") {
      this.#observer = new ResizeObserver(() => this.#draw());
      this.#observer.observe(this.#stage);
    }
    this.#bind();
    const owner = this.ownerDocument || document;
    owner.addEventListener("keydown", this.#onKey);
    owner.addEventListener("pointerover", this.#onTermIn);
    owner.addEventListener("pointerout", this.#onTermOut);
    owner.addEventListener("focusin", this.#onTermIn);
    owner.addEventListener("focusout", this.#onTermOut);
    const doc = this.ownerDocument || document;
    if (this.getAttribute("for")) {
      if (!this.#tabs && typeof MutationObserver !== "undefined") {
        this.#lookupObserver = new MutationObserver(() => this.#bind());
        this.#lookupObserver.observe(doc.documentElement, { childList: true, subtree: true });
      }
      if (!this.#tabs && doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", this.#onReady);
      if (!this.#tabs && typeof customElements !== "undefined") {
        customElements.whenDefined("vc-tabs").then(() => { if (generation === this.#generation) this.#bind(); });
      }
    }
    this.#draw();
  }

  disconnectedCallback() {
    this.#generation++;
    this.#observer?.disconnect(); this.#observer = null;
    this.#lookupObserver?.disconnect(); this.#lookupObserver = null;
    (this.ownerDocument || document).removeEventListener("DOMContentLoaded", this.#onReady);
    const doc = this.ownerDocument || document;
    doc.removeEventListener("keydown", this.#onKey);
    doc.removeEventListener("pointerover", this.#onTermIn);
    doc.removeEventListener("pointerout", this.#onTermOut);
    doc.removeEventListener("focusin", this.#onTermIn);
    doc.removeEventListener("focusout", this.#onTermOut);
    this.#tabs?.removeEventListener("vc-tab-change", this.#onChange);
    this.#tabs = null;
  }

  #render() {
    this.dataset.ready = "1";
    const doc = this.ownerDocument || document;
    const art = Array.from(this.children).find((child) => child.tagName.toLowerCase() === "svg");
    let graph = null;
    if (!art) {
      const source = this.textContent;
      const parsed = parseFlow(source);
      if (!parsed.ok) {
        this.textContent = "";
        const original = doc.createElement("pre"); original.textContent = source;
        const errors = doc.createElement("pre"); errors.className = "vc-diagram-error";
        errors.setAttribute("role", "alert");
        errors.textContent = parsed.errors.map((error) => `Line ${error.line}: ${error.why}\n${error.text}`).join("\n");
        this.append(original, errors); return;
      }
      graph = parsed.graph; this.#graph = graph; this.#layout = LAYOUTS[graph.kind](graph);
      this.setAttribute("data-dir", graph.dir); this.setAttribute("data-diagram-kind", graph.kind);
      this.textContent = "";
    }
    this.setAttribute("role", "figure");
    const label = this.getAttribute("label");
    if (label) this.setAttribute("aria-label", label);
    const stage = doc.createElement("div"); stage.className = "vc-diagram-stage"; this.#stage = stage;
    this.#art = !!art;
    if (art) {
      stage.append(art);
      for (const anchor of art.querySelectorAll("[data-node]")) {
        const id = anchor.getAttribute("data-node");
        if (id && !this.#anchors.has(id)) this.#anchors.set(id, anchor);
      }
    } else {
      const svg = doc.createElementNS(SVG_NS, "svg"); svg.setAttribute("class", "vc-diagram-edges"); svg.setAttribute("aria-hidden", "true");
      stage.style.setProperty("--vc-ranks", this.#layout.ranks); stage.style.setProperty("--vc-lanes", this.#layout.lanes);
      if (graph.kind === "sequence") {
        for (let i = 0; i < graph.nodes.length; i++) {
          const line = doc.createElementNS(SVG_NS, "path");
          line.setAttribute("class", "vc-diagram-lifeline");
          svg.append(line); this.#lifelines.push(line);
        }
      }
      const defs = doc.createElementNS(SVG_NS, "defs"), arrow = doc.createElementNS(SVG_NS, "marker");
      const arrowId = `vc-diagram-arrow-${++diagramNumber}`;
      arrow.setAttribute("id", arrowId); arrow.setAttribute("viewBox", "0 0 10 10"); arrow.setAttribute("refX", "9"); arrow.setAttribute("refY", "5"); arrow.setAttribute("markerWidth", "10"); arrow.setAttribute("markerHeight", "10"); arrow.setAttribute("markerUnits", "userSpaceOnUse"); arrow.setAttribute("orient", "auto");
      const tip = doc.createElementNS(SVG_NS, "path"); tip.setAttribute("d", "M 0 0 L 10 5 L 0 10 Z"); arrow.append(tip); defs.append(arrow); svg.append(defs);
      graph.edges.forEach((edge) => {
        const path = doc.createElementNS(SVG_NS, "path"); path.setAttribute("data-style", edge.style);
        path.setAttribute("data-from", edge.from); path.setAttribute("data-to", edge.to);
        path.setAttribute("data-kind", edge.kind || (edge.style === "dotted" ? "async" : "default"));
        if (edge.arrow) path.setAttribute("marker-end", `url(#${arrowId})`);
        svg.append(path); this.#paths.push(path);
        if (edge.label) { const label = doc.createElement("span"); label.className = "vc-edge-label"; label.textContent = edge.label; stage.append(label); this.#labels.push(label); }
        else this.#labels.push(null);
      });
      stage.append(svg);
      for (const node of graph.nodes) {
        const element = doc.createElement("button"); element.type = "button"; element.className = "vc-node";
        element.setAttribute("data-node", node.id); element.setAttribute("data-shape", node.shape);
        if (node.tone) element.setAttribute("data-tone", node.tone);
        element.style.setProperty("--rank", this.#layout.rank.get(node.id)); element.style.setProperty("--lane", this.#layout.lane.get(node.id));
        element.textContent = node.label; stage.append(element); this.#anchors.set(node.id, element);
      }
    }
    const marker = doc.createElement("span"); marker.className = "vc-diagram-marker"; marker.textContent = this.getAttribute("marker") || "here"; marker.hidden = true; marker.setAttribute("aria-hidden", "true"); stage.append(marker); this.#marker = marker;
    const caption = doc.createElement("p"); caption.className = "vc-diagram-caption"; caption.setAttribute("aria-live", "polite"); this.#caption = caption;
    const list = doc.createElement("ul"); list.className = "vc-diagram-anchors";
    for (const [id, anchor] of this.#anchors) { const item = doc.createElement("li"); item.textContent = anchor.textContent?.trim() || id; list.append(item); }
    this.append(stage, caption, list);
    this.#setupGraph(doc);
  }
  #setupGraph(doc) {
    this.#network = readGraph(this.#stage, this.#graph?.kind === "state");
    if (this.#graph) this.#network.problems.push(...this.#graph.problems);
    this.#anchors = new Map(Array.from(this.#network.nodes, ([id, node]) => [id, node.el]));
    this.setAttribute("data-diagram-mode", "idle");
    const tools = doc.createElement("div"); tools.className = "vc-diagram-tools";
    const makeButton = (text, action) => {
      const button = doc.createElement("button"); button.type = "button"; button.className = "vc-btn";
      button.textContent = text; button.disabled = true; button.addEventListener("click", action); tools.append(button);
      return button;
    };
    this.#up = makeButton("What feeds this", () => this.#show("up"));
    this.#down = makeButton("What this feeds", () => this.#show("down"));
    this.#clearButton = makeButton("Clear", () => this.#clearSelection());
    this.#status = doc.createElement("span"); this.#status.className = "vc-diagram-status";
    this.#status.setAttribute("role", "status"); this.#status.textContent = "Select a node to begin.";
    tools.append(this.#status); this.insertBefore(tools, this.#stage);
    if (this.#network.problems.length) {
      const problems = doc.createElement("p"); problems.className = "vc-diagram-status";
      problems.setAttribute("role", "status"); problems.textContent = this.#network.problems.join(" "); this.append(problems);
    }
    if (this.#network.nodes.size > 12) {
      const note = doc.createElement("p"); note.className = "vc-diagram-budget";
      note.textContent = `This diagram has ${this.#network.nodes.size} parts. Consider splitting it.`; this.append(note);
    }
    for (const [id, node] of this.#network.nodes) {
      const el = node.el;
      el.setAttribute("role", "button"); el.setAttribute("tabindex", "0"); el.setAttribute("aria-pressed", "false");
      el.addEventListener("click", () => this.#select(id));
      if (el.tagName.toLowerCase() !== "button") el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); this.#select(id); }
      });
    }
    const svg = this.#art ? this.#stage.querySelector?.("svg") : this.#stage.querySelector?.("svg.vc-diagram-edges");
    if (svg && this.#art) svg.setAttribute("role", "group");
    const number = ++diagramNumber;
    if (svg) {
      const defs = doc.createElementNS(SVG_NS, "defs");
      for (const kind of Object.keys(EDGE_KINDS)) {
        const marker = doc.createElementNS(SVG_NS, "marker");
        marker.setAttribute("id", `vc-diagram-${number}-${kind}`);
        marker.setAttribute("viewBox", "0 0 10 10"); marker.setAttribute("refX", "9"); marker.setAttribute("refY", "5");
        marker.setAttribute("markerWidth", "10"); marker.setAttribute("markerHeight", "10"); marker.setAttribute("markerUnits", "userSpaceOnUse"); marker.setAttribute("orient", "auto");
        marker.setAttribute("data-kind", kind);
        const tip = doc.createElementNS(SVG_NS, "path"); tip.setAttribute("d", "M 0 0 L 10 5 L 0 10 Z");
        marker.append(tip); defs.append(marker);
      }
      svg.append(defs);
      for (const edge of this.#network.edges) {
        if (this.#art || edge.el.hasAttribute("marker-end")) edge.el.setAttribute("marker-end", `url(#vc-diagram-${number}-${edge.kind})`);
      }
    }
    let legend = Array.from(this.children).find((child) => child.className === "vc-diagram-legend");
    if (!legend) { legend = doc.createElement("div"); legend.className = "vc-diagram-legend"; }
    this.append(legend);
    legend.textContent = ""; legend.setAttribute("aria-label", "Line styles shown");
    const used = new Set(this.#network.edges.map((edge) => edge.kind));
    for (const kind of used) {
      const item = doc.createElement("span");
      const sample = doc.createElementNS(SVG_NS, "svg"); sample.setAttribute("viewBox", "0 0 46 10"); sample.setAttribute("aria-hidden", "true");
      const line = doc.createElementNS(SVG_NS, "path"); line.setAttribute("d", "M 2 5 H 39"); line.setAttribute("data-kind", kind);
      // The sample ends in the same marker as the diagram's lines: a dashed kind must not get a dashed head.
      if (svg) line.setAttribute("marker-end", `url(#vc-diagram-${number}-${kind})`);
      sample.append(line); item.append(sample);
      const label = doc.createElement("span"); label.textContent = EDGE_KINDS[kind]; item.append(label); legend.append(item);
    }
  }

  #clear() {
    this.setAttribute("data-diagram-mode", "idle");
    for (const node of this.#network.nodes.values()) { node.el.removeAttribute("data-reach-depth"); node.el.removeAttribute("data-step-focus"); }
    for (const edge of this.#network.edges) { edge.el.removeAttribute("data-reach-edge"); edge.el.removeAttribute("data-step-focus"); }
    for (const badge of this.#badges) badge.remove();
    this.#badges = [];
    this.#up.setAttribute("aria-pressed", "false"); this.#down.setAttribute("aria-pressed", "false");
  }

  #step() {
    this.#clear();
    const focus = this.#tabs?.panels[this.#tabs.index]?.focus || [];
    const ids = new Set(focus.filter((id) => this.#network.nodes.has(id)));
    if (!ids.size) return;
    this.setAttribute("data-diagram-mode", "step");
    for (const id of ids) this.#network.nodes.get(id).el.setAttribute("data-step-focus", "");
    for (const edge of this.#network.edges) if (ids.has(edge.from) && ids.has(edge.to)) edge.el.setAttribute("data-step-focus", "");
  }

  #select(id) {
    this.#selected = id;
    for (const [key, node] of this.#network.nodes) node.el.setAttribute("aria-pressed", String(key === id));
    this.#up.disabled = false; this.#down.disabled = false; this.#clearButton.disabled = false;
    this.#step();
    this.#status.textContent = `${this.#network.nodes.get(id).label} selected.`;
  }

  #clearSelection() {
    if (!this.#network) return;
    this.#selected = null;
    for (const node of this.#network.nodes.values()) node.el.setAttribute("aria-pressed", "false");
    this.#up.disabled = true; this.#down.disabled = true; this.#clearButton.disabled = true;
    this.#step(); this.#status.textContent = "Cleared.";
  }

  #show(direction) {
    if (!this.#selected) return;
    const button = direction === "up" ? this.#up : this.#down;
    if (button.getAttribute("aria-pressed") === "true") { this.#step(); this.#status.textContent = "Cleared."; return; }
    this.#clear();
    const result = reach(this.#network, this.#selected, direction);
    this.setAttribute("data-diagram-mode", "reach"); button.setAttribute("aria-pressed", "true");
    const doc = this.ownerDocument || document;
    for (const [id, depth] of result.depth) {
      const node = this.#network.nodes.get(id);
      node.el.setAttribute("data-reach-depth", String(depth));
      if (!depth) continue;
      let badge;
      if (node.el.namespaceURI === SVG_NS) {
        const box = node.el.getBBox();
        const x = box.x + box.width - 4, y = box.y + 4;
        badge = doc.createElementNS(SVG_NS, "g"); badge.setAttribute("class", "vc-diagram-depth");
        const circle = doc.createElementNS(SVG_NS, "circle"); circle.setAttribute("cx", x); circle.setAttribute("cy", y); circle.setAttribute("r", "9");
        const text = doc.createElementNS(SVG_NS, "text"); text.setAttribute("x", x); text.setAttribute("y", y); text.textContent = String(depth);
        badge.append(circle, text);
      } else {
        badge = doc.createElement("span"); badge.className = "vc-diagram-depth"; badge.textContent = String(depth);
      }
      badge.setAttribute("aria-hidden", "true"); node.el.append(badge); this.#badges.push(badge);
    }
    for (const edge of result.edges) edge.el.setAttribute("data-reach-edge", "");
    const names = Array.from(result.depth.keys()).filter((id) => id !== this.#selected).map((id) => this.#network.nodes.get(id).label);
    const label = this.#network.nodes.get(this.#selected).label;
    this.#status.textContent = direction === "up" ? `These feed ${label}: ${names.join(", ") || "nothing"}.` : `${label} feeds these: ${names.join(", ") || "nothing"}.`;
  }

  #link(event, active) {
    const target = event.target;
    const term = target?.closest?.("vc-term[data-node]");
    const node = target?.closest?.("[data-node]");
    const id = term?.getAttribute("data-node") || node?.getAttribute("data-node");
    if (!id || !this.#network.nodes.has(id)) return;
    const related = event.relatedTarget;
    if (related && ((term && term.contains(related)) || (!term && node?.contains(related)))) return;
    const linkedNode = this.#network.nodes.get(id).el;
    if (!term && node !== linkedNode) return;
    linkedNode.toggleAttribute("data-term-focus", active);
    const doc = this.ownerDocument || document;
    for (const item of doc.querySelectorAll?.("vc-term[data-node]") || []) {
      if (item.getAttribute("data-node") === id) item.toggleAttribute("data-term-focus", active);
    }
  }


  #bind() {
    if (this.#tabs) return;
    const id = this.getAttribute("for");
    const doc = this.ownerDocument || document;
    const tabs = id && doc.getElementById(id);
    if (!tabs || typeof tabs.select !== "function" || !Array.isArray(tabs.panels) || tabs.panels.length === 0) return;
    this.#tabs = tabs; this.#lookupObserver?.disconnect(); this.#lookupObserver = null;
    doc.removeEventListener("DOMContentLoaded", this.#onReady);
    tabs.addEventListener("vc-tab-change", this.#onChange);
    for (const [nodeId, anchor] of this.#anchors) {
      const index = tabs.panels.findIndex((panel) => panel.at === nodeId);
      if (index < 0) continue;
      const target = this.#anchors.get(nodeId);
      if (this.#art) { target.setAttribute("role", "button"); target.setAttribute("tabindex", "0"); }
      if (!target.__vcDiagramBound) {
        target.__vcDiagramBound = true;
        const select = () => { const n = this.#tabs?.panels.findIndex((panel) => panel.at === nodeId); if (n >= 0) this.#tabs.select(n); };
        target.addEventListener("click", select);
        if (this.#art) target.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } });
      }
    }
    this.#draw();
  }

  #draw() {
    if (!this.#stage) return;
    const stageRect = this.#stage.getBoundingClientRect();
    const rects = new Map();
    for (const [id, anchor] of this.#anchors) {
      const rect = anchor.getBoundingClientRect();
      rects.set(id, { x: rect.left - stageRect.left, y: rect.top - stageRect.top, w: rect.width, h: rect.height });
    }
    if (this.#graph) {
      const flow = typeof getComputedStyle === "function" && getComputedStyle(this.#stage).getPropertyValue("--vc-diagram-flow").trim() === "TB" ? "TB" : this.#graph.dir;
      const sizes = this.#labels.map((label) => {
        if (!label) return null;
        const rect = label.getBoundingClientRect();
        return { w: rect.width, h: rect.height };
      });
      if (LANE_LABELS.has(this.#graph.kind)) {
        const widest = Math.max(0, ...sizes.map((size) => (size ? size.w : 0)));
        const gap = widest ? `${Math.ceil(widest) + LANE_PAD}px` : "";
        if (gap !== this.#laneGap) {
          this.#laneGap = gap; this.#stage.style.setProperty("--vc-lane-gap", gap);
          this.#draw(); return;
        }
      }
      const result = this.#graph.kind === "sequence"
        ? routeSequence(this.#graph, rects, sizes)
        : routeFlow(this.#graph, rects, flow, sizes);
      if (this.#graph.kind === "sequence") {
        this.#stage.style.minHeight = `${result.height}px`;
        result.lifelines.forEach((d, index) => this.#lifelines[index].setAttribute("d", d));
      }
      for (const route of result.routes) {
        this.#paths[route.index].setAttribute("d", route.d);
        const label = this.#labels[route.index];
        if (label && route.labelAt) { label.style.left = `${route.labelAt.x}px`; label.style.top = `${route.labelAt.y}px`; }
      }
      if (result.warnings.length) {
        if (!this.#geometry) { this.#geometry = (this.ownerDocument || document).createElement("p"); this.#geometry.className = "vc-diagram-geometry"; this.#geometry.setAttribute("role", "status"); this.append(this.#geometry); }
        this.#geometry.textContent = `Layout warning: ${result.warnings.join("; ")}.`;
      } else if (this.#geometry) { this.#geometry.remove(); this.#geometry = null; }
    }
    if (this.getAttribute("data-diagram-mode") !== "reach") this.#step();
    const at = this.#tabs?.panels[this.#tabs.index]?.at ?? null;
    const point = markerPosition(at, rects);
    for (const [id, anchor] of this.#anchors) {
      if (point && id === at) anchor.setAttribute("aria-current", "step"); else anchor.removeAttribute("aria-current");
    }
    this.#marker.hidden = !point;
    if (point) {
      this.#marker.style.setProperty("--mx", `${point.x}px`); this.#marker.style.setProperty("--my", `${point.y}px`);
      const label = this.#network.nodes.get(at)?.label || at;
      this.#caption.textContent = `${this.getAttribute("marker") || "here"} is at ${label}`;
    } else {
      this.#caption.textContent = "";
      if (at && !this.#warned.has(at)) { this.#warned.add(at); console.warn(`vc-diagram: unknown node '${at}'.`); }
    }
  }
}

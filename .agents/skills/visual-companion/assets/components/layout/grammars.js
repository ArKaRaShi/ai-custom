import { EDGE_KINDS } from "./kinds.js";

/*
 * Text sources of the tree, sequence and state diagram kinds. The first non-blank line is the
 * kind; blank lines and text after %% are ignored. Every line either parses or is reported
 * with its line number, and a source that reports any error draws nothing.
 *
 *   tree      id[Label] or id(Label), one per line and indented under its parent (an optional
 *             leading "- " or "* " is allowed); or parent --> child chains, each step with an
 *             optional |label| and @kind before the child
 *   sequence  participant id [as Label]; then one message per line, in time order:
 *             a -> b: text (request), b --> a: text (return), a ->> b: text (async); the text
 *             may start with @kind to choose another edge kind
 *   state     [*] --> id (initial), id --> [*] (terminal), id --> id: label or
 *             id -->|label| @kind id (transition); a self-loop is allowed here only
 *
 * Mistakes in what the source says rather than in how it is written (a duplicate node, a self
 * edge, a tree node with two parents or a cycle) are collected in `problems`; the offending
 * part is left out and the rest is drawn.
 */
const ID = "[A-Za-z_][A-Za-z0-9_]*";
const EDGE_KIND = Object.keys(EDGE_KINDS).join("|");
const NODE = new RegExp(`^(${ID})(?:\\[([^\\[\\](){}]+)\\]|\\(([^\\[\\](){}]+)\\))?$`);
const PARTICIPANT = new RegExp(`^participant\\s+(${ID})(?:\\s+as\\s+(.+))?$`, "i");
const MESSAGE = new RegExp(`^(${ID})\\s*(-->|->>|->)\\s*(${ID})\\s*:\\s*(?:@(${EDGE_KIND})\\s+)?(.+)$`);
const STEP = new RegExp(`^(?:\\|([^|]+)\\|\\s*)?(?:@(${EDGE_KIND})\\s+)?([^:]*?)\\s*(?::\\s*(.+))?$`);
const TREE_STEP = new RegExp(`^(?:\\|([^|]+)\\|\\s*)?(?:@(${EDGE_KIND})\\s+)?(.*)$`);
const ARROW_KIND = { "->": "default", "-->": "return", "->>": "async" };

export function parseKind(source, kind, maxNodes) {
  const lines = source.split(/\r?\n/);
  const nodes = new Map(), edges = [], problems = [], errors = [], explicit = new Set(), parents = new Map();
  const outline = [];
  let header = false;
  const fail = (index, why) => errors.push({ line: index + 1, text: lines[index], why });
  const declare = (id, label, shape = "rect") => {
    if (explicit.has(id)) { problems.push(`Duplicate node: ${id}.`); return; }
    explicit.add(id);
    nodes.set(id, { id, label, shape, tone: null });
  };
  const mention = (id) => {
    if (!nodes.has(id)) nodes.set(id, { id, label: id, shape: "rect", tone: null });
    return id;
  };
  const node = (text) => {
    const match = NODE.exec(text.trim());
    if (!match) return null;
    const [, id, square, round] = match;
    if (square === undefined && round === undefined) return mention(id);
    const label = (square ?? round).trim();
    if (!label) return null;
    declare(id, label, round === undefined ? "rect" : "pill");
    return id;
  };
  const marker = (name) => {
    const id = `__vc_${name}`;
    if (!nodes.has(id)) nodes.set(id, { id, label: name === "initial" ? "Start" : "End", shape: "pill", tone: null });
    return id;
  };
  const connect = (from, to, label, edgeKind) => {
    const style = edgeKind === "return" || edgeKind === "async" ? "dotted" : "solid";
    if (from === to && kind !== "state") problems.push(`Self edge: ${from}.`);
    else edges.push({ from, to, label, style, arrow: true, kind: edgeKind });
  };

  const sequenceLine = (line, index) => {
    const participant = PARTICIPANT.exec(line);
    if (participant) { declare(participant[1], participant[2]?.trim() || participant[1]); return; }
    const message = MESSAGE.exec(line);
    if (!message || !message[5].trim()) { fail(index, "Invalid sequence participant or message."); return; }
    connect(mention(message[1]), mention(message[3]), message[5].trim(), message[4] || ARROW_KIND[message[2]]);
  };

  const stateLine = (line, index) => {
    const split = line.indexOf("-->");
    if (split < 0) { if (!node(line)) fail(index, "Invalid state or transition."); return; }
    const step = STEP.exec(line.slice(split + 3).trim());
    const target = step?.[3].trim();
    const from = line.slice(0, split).trim();
    const label = step?.[4]?.trim() || step?.[1]?.trim() || null;
    if (!step || !target || (step[4] !== undefined && !step[4].trim()) || (step[1] && step[4])) { fail(index, "Invalid state transition."); return; }
    const source = from === "[*]" ? marker("initial") : node(from);
    const destination = target === "[*]" ? marker("terminal") : node(target);
    if (!source || !destination) { fail(index, "Invalid state transition."); return; }
    connect(source, destination, label, step[2] || "default");
  };

  const treeLine = (line, raw, index) => {
    const chain = line.split(/\s*-->\s*/);
    if (chain.length > 1) {
      const steps = chain.slice(1).map((part) => TREE_STEP.exec(part));
      const ids = [node(chain[0]), ...steps.map((step) => node(step[3]))];
      if (ids.includes(null)) { fail(index, "Invalid tree edge."); return; }
      steps.forEach((step, i) => connect(ids[i], ids[i + 1], step[1]?.trim() || null, step[2] || "default"));
      return;
    }
    const id = node(line.replace(/^[-*]\s+/, ""));
    if (!id) { fail(index, "Invalid tree node."); return; }
    const indent = raw.length - raw.trimStart().length;
    while (outline.length && outline.at(-1).indent >= indent) outline.pop();
    if (outline.length) connect(outline.at(-1).id, id, null, "default");
    outline.push({ id, indent });
  };

  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index].replace(/%%.*$/, "");
    const line = raw.trim();
    if (!line) continue;
    if (!header) { header = true; continue; }
    if (kind === "sequence") sequenceLine(line, index);
    else if (kind === "state") stateLine(line, index);
    else treeLine(line, raw, index);
    if (nodes.size > maxNodes) { fail(index, `Maximum ${maxNodes} nodes; split the diagram.`); break; }
  }
  if (errors.length) return { ok: false, errors };

  if (kind === "tree") {
    const accepted = [];
    for (const edge of edges) {
      if (parents.has(edge.to)) { problems.push(`Tree node ${edge.to} has more than one parent.`); continue; }
      let cycle = false;
      for (let up = edge.from; up !== undefined && !cycle; up = parents.get(up)) cycle = up === edge.to;
      if (cycle) { problems.push(`Tree cycle: ${edge.from} → ${edge.to}.`); continue; }
      parents.set(edge.to, edge.from);
      accepted.push(edge);
    }
    edges.splice(0, edges.length, ...accepted);
  }
  return { ok: true, graph: { kind, dir: kind === "sequence" ? "LR" : "TB", nodes: [...nodes.values()], edges, problems } };
}

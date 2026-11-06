import "./globals";
import { afterEach, expect, spyOn, test } from "bun:test";
import { parseFlow, readGraph, reach } from "../assets/components/diagram.js";
import { FakeElement, FakeEvent } from "./dom";
import { cleanup, graphEdge, graphNode, harness, Node, Observer, pathPoints, Tabs } from "./diagram-fixture";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCss, splitSelectors } from "./css";

const stylesheetPath = join(import.meta.dir, "..", "assets", "components.css");
const stylesheet = readFileSync(stylesheetPath, "utf8");

function graph(source: string) {
  const result = parseFlow(source);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.graph;
}

test("parses the supported flowchart grammar without interpreting labels as HTML", () => {
  const result = graph("%% comment\nflowchart TD\na[<API>]:::ok -->|request| b(Queue)\nb -.-> c:::warn\nc --- d:::danger %% comment");
  expect(result.dir).toBe("TB");
  expect(result.nodes).toEqual([
    { id: "a", label: "<API>", shape: "rect", tone: "ok" },
    { id: "b", label: "Queue", shape: "pill", tone: null },
    { id: "c", label: "c", shape: "rect", tone: "warn" },
    { id: "d", label: "d", shape: "rect", tone: "danger" },
  ]);
  expect(result.edges).toEqual([
    { from: "a", to: "b", label: "request", style: "solid", arrow: true },
    { from: "b", to: "c", label: null, style: "dotted", arrow: true },
    { from: "c", to: "d", label: null, style: "solid", arrow: false },
  ]);
  expect(graph("a --> b\na[First]\na[Ignored]").nodes[0].label).toBe("First");
});

test("unsupported syntax produces line-numbered errors, without accepting partial chains", () => {
  const result = parseFlow("graph LR\nsubgraph x\nstyle a fill:red\nclassDef x fill:red\nclick a x\na & b --> c\na{choice}\na((circle))\na ==> b");
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.errors.map((error: { line: number }) => error.line)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  expect(result.errors.every((error: { why: string }) => error.why.length > 0)).toBe(true);
});

test("rejects oversized diagrams at the relevant source line", () => {
  const many = parseFlow(Array.from({ length: 25 }, (_, i) => `n${i}`).join(" --> "));
  expect(many.ok).toBe(false);
  if (!many.ok) expect(many.errors[0].why).toContain("split");
  const wide = parseFlow("graph LR\na\nb\nc\nd\ne\nf\ng\n\n");
  expect(wide.ok).toBe(true);
});


test("graph boundary reports duplicate nodes, unknown endpoints, and self-edges without including them", () => {
  const root = new Node("svg");
  const api = graphNode("api", "API");
  const queue = graphNode("queue", "Queue");
  const duplicate = graphNode("api", "Duplicate");
  const empty = graphNode("", "Empty");
  const valid = graphEdge("api", "queue");
  const missingFrom = graphEdge("missing", "queue");
  const missingTo = graphEdge("api", "missing");
  const self = graphEdge("api", "api");
  root.append(api, queue, duplicate, empty, valid, missingFrom, missingTo, self);

  const result = readGraph(root);
  const nodeIds = [...result.nodes.keys()];
  const apiNode = result.nodes.get("api");
  expect(nodeIds).toEqual(["api", "queue"]);
  expect(apiNode).toEqual({ id: "api", el: api, label: "API" });
  expect(result.edges).toEqual([{ from: "api", to: "queue", kind: "default", el: valid }]);
  expect(result.problems).toHaveLength(5);
});

test("reach excludes return edges and gives exact hop depths through retry cycles", () => {
  const root = new Node("svg");
  const client = graphNode("client", "Client");
  const lb = graphNode("lb", "Load balancer");
  const api = graphNode("api", "API");
  const cache = graphNode("cache", "Cache");
  const queue = graphNode("queue", "Queue");
  const worker = graphNode("worker", "Worker");
  const database = graphNode("database", "Database");
  const clientLb = graphEdge("client", "lb");
  const lbApi = graphEdge("lb", "api");
  const apiCache = graphEdge("api", "cache");
  const cacheReply = graphEdge("cache", "api", "return");
  const apiQueue = graphEdge("api", "queue");
  const queueWorker = graphEdge("queue", "worker", "async");
  const retry = graphEdge("worker", "queue");
  const workerDatabase = graphEdge("worker", "database");
  const reply = graphEdge("database", "api", "return");
  root.append(client, lb, api, cache, queue, worker, database, clientLb, lbApi, apiCache, cacheReply, apiQueue, queueWorker, retry, workerDatabase, reply);

  const parsed = readGraph(root);
  expect(parsed.problems).toEqual([]);
  const upstream = reach(parsed, "database", "up");
  const upstreamDepth = new Map([["database", 0], ["worker", 1], ["queue", 2], ["api", 3], ["lb", 4], ["client", 5]]);
  const upstreamElements = upstream.edges.map((edge: { el: Node }) => edge.el);
  const upstreamSet = new Set(upstreamElements);
  const expectedUpstream = new Set([clientLb, lbApi, apiQueue, queueWorker, retry, workerDatabase]);
  expect(upstream.depth).toEqual(upstreamDepth);
  expect(upstreamSet).toEqual(expectedUpstream);
  const downstream = reach(parsed, "api", "down");
  const downstreamDepth = new Map([["api", 0], ["cache", 1], ["queue", 1], ["worker", 2], ["database", 3]]);
  const downstreamElements = downstream.edges.map((edge: { el: Node }) => edge.el);
  const downstreamSet = new Set(downstreamElements);
  const expectedDownstream = new Set([apiCache, apiQueue, queueWorker, retry, workerDatabase]);
  expect(downstream.depth).toEqual(downstreamDepth);
  expect(downstreamSet).toEqual(expectedDownstream);
});

afterEach(cleanup);

function geometryFixture() {
  const fixture = harness();
  Object.assign(globalThis, { ResizeObserver: Observer });
  fixture.diagram.textContent = "flow\na[A] -->|label| b[B]\na -.->|other| c[C]\nb --> d[D]\nc --> d";
  fixture.diagram.connectedCallback();
  const positions: Record<string, { left: number; top: number; width: number; height: number }> = {
    a: { left: 40, top: 100, width: 80, height: 60 },
    b: { left: 240, top: 30, width: 80, height: 60 },
    c: { left: 240, top: 170, width: 80, height: 60 },
    d: { left: 440, top: 100, width: 80, height: 60 },
  };
  for (const id of Object.keys(positions)) fixture.anchor(id).rect = positions[id]!;
  Observer.notify();
  const stage = fixture.find("vc-diagram-stage");
  const svg = stage.children.find((child) => child.tagName === "svg")!;
  const paths = svg.children.filter((child) => child.hasAttribute("data-from"));
  const labels = stage.children.filter((child) => child.className === "vc-edge-label") as Node[];
  return { ...fixture, positions, svg, paths, labels };
}

test("flow edges use right angles", () => {
  const { paths } = geometryFixture();
  for (const path of paths) {
    const points = pathPoints(path);
    expect(points.length).toBeGreaterThan(1);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!, b = points[i]!;
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
  }
});

test("flow edge labels clear nodes and other labels", () => {
  const { labels, positions } = geometryFixture();
  const boxes = Object.values(positions).map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height }));
  for (const label of labels) {
    const x = Number.parseFloat(label.style.left), y = Number.parseFloat(label.style.top);
    const box = { x: x - label.rect.width / 2, y: y - label.rect.height / 2, w: label.rect.width, h: label.rect.height };
    for (const other of boxes) {
      const overlap = box.x < other.x + other.w && box.x + box.w > other.x && box.y < other.y + other.h && box.y + box.h > other.y;
      expect(overlap).toBe(false);
    }
    boxes.push(box);
  }
});

test("flow edges sharing a side attach at least 12px apart", () => {
  const { paths } = geometryFixture();
  const first = pathPoints(paths[0]!);
  const second = pathPoints(paths[1]!);
  const distance = Math.abs(first[0]!.y - second[0]!.y);
  expect(distance).toBeGreaterThanOrEqual(12);
});

test("flow arrowheads have the same dimensions", () => {
  const { svg, paths } = geometryFixture();
  const defs = svg.children.filter((child) => child.tagName === "defs");
  const markers = defs.flatMap((definition) => definition.children).filter((child) => child.tagName === "marker");
  const sizes = paths.map((path) => {
    const reference = path.getAttribute("marker-end") ?? "";
    const id = reference.slice(5, -1);
    const marker = markers.find((candidate) => candidate.getAttribute("id") === id);
    expect(marker).toBeDefined();
    return `${marker!.getAttribute("markerWidth")}x${marker!.getAttribute("markerHeight")}`;
  });
  expect(sizes.length).toBeGreaterThan(1);
  const distinct = new Set(sizes);
  expect(distinct.size).toBe(1);
});

test("flow edges avoid non-endpoint nodes", () => {
  const { paths, positions } = geometryFixture();
  for (const path of paths) {
    const from = path.getAttribute("data-from"), to = path.getAttribute("data-to");
    const points = pathPoints(path);
    for (const [id, box] of Object.entries(positions)) {
      if (id === from || id === to) continue;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]!, b = points[i]!;
        const crosses = a.x === b.x
          ? a.x > box.left && a.x < box.left + box.width && Math.max(a.y, b.y) > box.top && Math.min(a.y, b.y) < box.top + box.height
          : a.y > box.top && a.y < box.top + box.height && Math.max(a.x, b.x) > box.left && Math.min(a.x, b.x) < box.left + box.width;
        expect(crosses).toBe(false);
      }
    }
  }
});

test("invalid flow displays the source and numbered errors, without a stage", () => {
  const { diagram, find } = harness();
  diagram.textContent = "graph LR\na{bad}";
  diagram.connectedCallback();
  expect(diagram.textContent).toContain("a{bad}");
  expect(find("vc-diagram-error").textContent).toContain("Line 2");
  expect(find("vc-diagram-stage")).toBeUndefined();
  expect(diagram.dataset.ready).toBe("1");
});

test("bare flow kind renders the graph", () => {
  const { diagram, anchor } = harness();
  diagram.textContent = "flow\na --> b";
  diagram.connectedCallback();
  expect(anchor("a")).toBeDefined();
  expect(anchor("b")).toBeDefined();
});

test("explicit flow kind renders the graph", () => {
  const { diagram, anchor } = harness();
  diagram.textContent = "kind: flow\na --> b";
  diagram.connectedCallback();
  expect(anchor("a")).toBeDefined();
  expect(anchor("b")).toBeDefined();
});

test("unknown explicit kind is reported without a diagram", () => {
  const { diagram, find } = harness();
  diagram.textContent = "kind: bogus\na --> b";
  diagram.connectedCallback();
  const error = find("vc-diagram-error");
  expect(error.textContent).toContain("Unknown diagram kind: bogus.");
  expect(find("vc-diagram-stage")).toBeUndefined();
});

test("an unrecognized bare first word remains a node", () => {
  const { diagram, anchor, find } = harness();
  diagram.textContent = "foo\na --> b";
  diagram.connectedCallback();
  expect(anchor("foo")).toBeDefined();
  expect(anchor("a")).toBeDefined();
  expect(anchor("b")).toBeDefined();
  const stage = find("vc-diagram-stage");
  const edges = stage.querySelectorAll("[data-from][data-to]");
  expect(edges).toHaveLength(1);
});

test("duplicate node definitions and self edges are reported and ignored", () => {
  const { diagram, anchor, find } = harness();
  diagram.textContent = "flow\na[First] --> b\na[Second] --> a";
  diagram.connectedCallback();
  expect(anchor("a").textContent).toBe("First");
  const stage = find("vc-diagram-stage");
  const edges = stage.querySelectorAll("[data-from][data-to]");
  expect(edges).toHaveLength(1);
  expect(diagram.textContent).toContain("Duplicate node: a.");
  expect(diagram.textContent).toContain("Self edge: a.");
});

test("flow follows tabs, navigates to the first matching panel, and reconnects without duplicate listeners", () => {
  const { diagram, ids, find, anchor } = harness();
  const tabs = new Tabs(); tabs.panels = [{ at: "a" }, { at: "b" }, { at: "a" }, { at: "absent" }];
  ids.set("steps", tabs);
  diagram.setAttribute("for", "steps"); diagram.setAttribute("marker", "request");
  diagram.textContent = "a[API] --> b[Queue]";
  diagram.connectedCallback();
  expect(anchor("a").tagName).toBe("button");
  expect(anchor("a").getAttribute("aria-current")).toBe("step");
  expect(find("vc-diagram-caption").textContent).toBe("request is at API");
  tabs.select(1);
  expect(anchor("a").hasAttribute("aria-current")).toBe(false);
  expect(anchor("b").getAttribute("aria-current")).toBe("step");
  anchor("a").click(); expect(tabs.index).toBe(0);
  diagram.disconnectedCallback();
  expect(tabs.listeners.get("vc-tab-change")?.length).toBe(0);
  diagram.connectedCallback();
  expect(tabs.listeners.get("vc-tab-change")?.length).toBe(1);
  tabs.select(3); expect(find("vc-diagram-marker").hidden).toBe(true);
});

test("late tabs binding and SVG anchors share marker and keyboard navigation", () => {
  const { diagram, ids, find, anchor } = harness();
  const svg = new Node("svg"), inlet = new Node("g"), rotor = new Node("g");
  inlet.setAttribute("data-node", "inlet"); inlet.textContent = "Inlet";
  rotor.setAttribute("data-node", "rotor"); rotor.textContent = "Rotor";
  svg.append(inlet, rotor); diagram.append(svg); diagram.setAttribute("for", "pump");
  diagram.connectedCallback();
  expect(find("vc-diagram-marker").hidden).toBe(true);
  const tabs = new Tabs(); tabs.panels = [{ at: "inlet" }, { at: "rotor" }]; ids.set("pump", tabs);
  Observer.notify();
  expect(anchor("inlet")).toBe(inlet);
  expect(inlet.getAttribute("role")).toBe("button");
  expect(find("vc-diagram-marker").hidden).toBe(false);
  const event = new FakeEvent("keydown") as FakeEvent & { key: string }; event.key = "Enter";
  rotor.dispatchEvent(event);
  expect(tabs.index).toBe(1);
  expect(find("vc-diagram-caption").textContent).toBe("here is at Rotor");
});

test("unknown positions hide the marker and warn only once per node", () => {
  const { diagram, ids, find } = harness();
  const tabs = new Tabs();
  tabs.panels = [{ at: "unknown" }, { at: "a" }];
  ids.set("steps", tabs);
  diagram.setAttribute("for", "steps");
  diagram.textContent = "a[API]";
  const warning = spyOn(console, "warn").mockImplementation(() => {});
  try {
    diagram.connectedCallback();
    expect(find("vc-diagram-marker").hidden).toBe(true);
    expect(find("vc-diagram-caption").textContent).toBe("");
    tabs.select(1);
    expect(find("vc-diagram-marker").hidden).toBe(false);
    tabs.select(0);
    expect(warning).toHaveBeenCalledTimes(1);
  } finally {
    warning.mockRestore();
  }
});

test("resize redraws the marker and disconnect stops observation", () => {
  const { diagram, ids, find, anchor } = harness();
  Object.assign(globalThis, { ResizeObserver: Observer });
  const tabs = new Tabs();
  tabs.panels = [{ at: "a" }];
  ids.set("steps", tabs);
  diagram.setAttribute("for", "steps");
  diagram.textContent = "a[API]";
  diagram.connectedCallback();
  anchor("a").rect.left = 80;
  Observer.notify();
  expect(find("vc-diagram-marker").style.values.get("--mx")).toBe("80px");
  diagram.disconnectedCallback();
  expect(Observer.instances.every((observer) => !observer.active)).toBe(true);
});

test("step focus follows the active tab and clears the previous step", () => {
  const { diagram, ids } = harness();
  const tabs = new Tabs();
  tabs.panels = [{ at: null, focus: ["api", "queue"] }, { at: null, focus: ["worker"] }];
  ids.set("steps", tabs);
  const svg = new Node("svg");
  const api = graphNode("api", "API");
  const queue = graphNode("queue", "Queue");
  const worker = graphNode("worker", "Worker");
  svg.append(api, queue, worker);
  diagram.append(svg);
  diagram.setAttribute("for", "steps");
  diagram.connectedCallback();

  const firstMode = diagram.getAttribute("data-diagram-mode");
  const firstApi = api.hasAttribute("data-step-focus");
  const firstQueue = queue.hasAttribute("data-step-focus");
  const firstWorker = worker.hasAttribute("data-step-focus");
  expect(firstMode).toBe("step");
  expect(firstApi).toBe(true);
  expect(firstQueue).toBe(true);
  expect(firstWorker).toBe(false);
  tabs.select(1);
  const nextApi = api.hasAttribute("data-step-focus");
  const nextQueue = queue.hasAttribute("data-step-focus");
  const nextWorker = worker.hasAttribute("data-step-focus");
  expect(nextApi).toBe(false);
  expect(nextQueue).toBe(false);
  expect(nextWorker).toBe(true);
});

test("legend lists present kinds only and a diagram over twelve nodes shows its budget", () => {
  const { diagram, find } = harness();
  const svg = new Node("svg");
  for (let index = 0; index < 13; index++) {
    const node = graphNode(`n${index}`);
    svg.append(node);
  }
  const edge = graphEdge("n0", "n1", "async");
  svg.append(edge);
  diagram.append(svg);
  diagram.connectedCallback();

  const legend = find("vc-diagram-legend");
  const budget = find("vc-diagram-budget");
  expect(legend.textContent).toContain("Background");
  expect(legend.textContent).not.toContain("Reply");
  expect(legend.textContent).not.toContain("Policy");
  expect(budget.textContent).toContain("13");
});

test("terms and diagram nodes highlight each other on focus and hover", () => {
  const { diagram, terms, doc } = harness();
  const svg = new Node("svg");
  const api = graphNode("api", "API");
  svg.append(api);
  diagram.append(svg);
  const term = new Node("vc-term");
  term.setAttribute("data-node", "api");
  terms.push(term);
  diagram.connectedCallback();

  const termFocus = new FakeEvent("focusin");
  termFocus.target = term;
  doc.dispatchEvent(termFocus);
  const nodeLit = api.hasAttribute("data-term-focus");
  const termLit = term.hasAttribute("data-term-focus");
  expect(nodeLit).toBe(true);
  expect(termLit).toBe(true);
  const termBlur = new FakeEvent("focusout");
  termBlur.target = term;
  doc.dispatchEvent(termBlur);
  const nodeCleared = api.hasAttribute("data-term-focus");
  expect(nodeCleared).toBe(false);
  const nodeHover = new FakeEvent("pointerover");
  nodeHover.target = api;
  doc.dispatchEvent(nodeHover);
  const termRelit = term.hasAttribute("data-term-focus");
  expect(termRelit).toBe(true);
  const nodeLeave = new FakeEvent("pointerout");
  nodeLeave.target = api;
  doc.dispatchEvent(nodeLeave);
  const termCleared = term.hasAttribute("data-term-focus");
  expect(termCleared).toBe(false);
});

test("reach controls show depths and status, toggle off, and clear on Escape", () => {
  const { diagram, find, doc } = harness();
  const svg = new Node("svg");
  const api = graphNode("api", "API");
  const queue = graphNode("queue", "Queue");
  const database = graphNode("database", "Database");
  const request = graphEdge("api", "queue");
  const persist = graphEdge("queue", "database");
  const reply = graphEdge("database", "api", "return");
  svg.append(api, queue, database, request, persist, reply);
  diagram.append(svg);
  diagram.connectedCallback();
  const tools = find("vc-diagram-tools");
  const upstream = tools.children.find((child) => child.textContent === "What feeds this");
  if (!upstream) throw new Error("Missing upstream control");
  database.click();
  upstream.click();

  const mode = diagram.getAttribute("data-diagram-mode");
  const apiDepth = api.getAttribute("data-reach-depth");
  const queueDepth = queue.getAttribute("data-reach-depth");
  const dbDepth = database.getAttribute("data-reach-depth");
  const requestLit = request.hasAttribute("data-reach-edge");
  const replyLit = reply.hasAttribute("data-reach-edge");
  const status = find("vc-diagram-status");
  expect(mode).toBe("reach");
  expect(apiDepth).toBe("2");
  expect(queueDepth).toBe("1");
  expect(dbDepth).toBe("0");
  expect(requestLit).toBe(true);
  expect(replyLit).toBe(false);
  expect(status.textContent).toContain("These feed Database:");
  upstream.click();
  const toggledMode = diagram.getAttribute("data-diagram-mode");
  const clearedDepth = api.hasAttribute("data-reach-depth");
  expect(toggledMode).toBe("idle");
  expect(clearedDepth).toBe(false);
  upstream.click();
  const escape = new FakeEvent("keydown") as FakeEvent & { key: string };
  escape.key = "Escape";
  doc.dispatchEvent(escape);
  const escapedMode = diagram.getAttribute("data-diagram-mode");
  const escapedEdge = persist.hasAttribute("data-reach-edge");
  expect(escapedMode).toBe("idle");
  expect(escapedEdge).toBe(false);
});

/**
 * Whether the request marker is on screen: the fake DOM runs no stylesheet, so this applies the one
 * thing the stylesheet decides, a rule `vc-diagram[data-diagram-mode="<mode>"] .vc-diagram-marker`
 * with `display: none`, to the mode the element carries.
 */
function markerShown(source: string, diagram: FakeElement, marker: FakeElement & { hidden: boolean }): boolean {
  if (marker.hidden) return false;
  const mode = diagram.getAttribute("data-diagram-mode");
  const hiddenModes = new Set<string>();
  for (const rule of parseCss(source).rules) {
    if (!/display:\s*none\s*;?/.test(rule.body)) continue;
    for (const part of splitSelectors(rule.selector)) {
      const hit = /^vc-diagram\[data-diagram-mode="(\w+)"\] \.vc-diagram-marker$/.exec(part);
      if (hit) hiddenModes.add(hit[1]);
    }
  }
  return mode === null || !hiddenModes.has(mode);
}

interface ReachScene {
  readonly diagram: FakeElement;
  readonly marker: FakeElement & { hidden: boolean; style: { values: Map<string, string> } };
  readonly tabs: Tabs;
  readonly database: Node;
  readonly upstream: FakeElement;
  readonly clear: FakeElement;
  readonly doc: { dispatchEvent(event: FakeEvent): void };
}

function reachScene(): ReachScene {
  const { diagram, ids, find, doc } = harness();
  const tabs = new Tabs();
  tabs.panels = [{ at: "api" }, { at: "queue" }];
  ids.set("steps", tabs);
  diagram.setAttribute("for", "steps");
  const svg = new Node("svg");
  const api = graphNode("api", "API");
  const queue = graphNode("queue", "Queue");
  const database = graphNode("database", "Database");
  api.rect.left = 10;
  queue.rect.left = 120;
  svg.append(api, queue, database, graphEdge("api", "queue"), graphEdge("queue", "database"));
  diagram.append(svg);
  diagram.connectedCallback();
  const tools = find("vc-diagram-tools");
  const upstream = tools.children.find((child) => child.textContent === "What feeds this");
  const clear = tools.children.find((child) => child.textContent === "Clear");
  if (!upstream || !clear) throw new Error("Missing reach controls");
  const marker = find("vc-diagram-marker") as ReachScene["marker"];
  return { diagram, marker, tabs, database, upstream, clear, doc };
}

function pressEscape(scene: ReachScene): void {
  const escape = new FakeEvent("keydown") as FakeEvent & { key: string };
  escape.key = "Escape";
  scene.doc.dispatchEvent(escape);
}

test("the request marker is hidden while the diagram is in reach mode and is back, at the current tab's node, when reach ends", () => {
  const scene = reachScene();
  expect(markerShown(stylesheet, scene.diagram, scene.marker)).toBe(true);
  expect(scene.marker.style.values.get("--mx")).toBe("10px");
  scene.database.click();
  scene.upstream.click();
  expect(scene.diagram.getAttribute("data-diagram-mode")).toBe("reach");
  expect(markerShown(stylesheet, scene.diagram, scene.marker)).toBe(false);
  scene.clear.click();
  expect(scene.diagram.getAttribute("data-diagram-mode")).toBe("idle");
  expect(markerShown(stylesheet, scene.diagram, scene.marker)).toBe(true);
  expect(scene.marker.style.values.get("--mx")).toBe("10px");
  scene.database.click();
  scene.upstream.click();
  expect(markerShown(stylesheet, scene.diagram, scene.marker)).toBe(false);
  pressEscape(scene);
  expect(markerShown(stylesheet, scene.diagram, scene.marker)).toBe(true);
  expect(scene.marker.style.values.get("--mx")).toBe("10px");
});

test("a tab change during reach leaves the marker hidden and puts it at the new tab's node when reach ends", () => {
  const scene = reachScene();
  scene.database.click();
  scene.upstream.click();
  scene.tabs.select(1);
  expect(scene.diagram.getAttribute("data-diagram-mode")).toBe("reach");
  expect(markerShown(stylesheet, scene.diagram, scene.marker)).toBe(false);
  pressEscape(scene);
  expect(markerShown(stylesheet, scene.diagram, scene.marker)).toBe(true);
  expect(scene.marker.style.values.get("--mx")).toBe("120px");
});

test("the marker check notices a stylesheet that keeps the marker visible in reach mode", () => {
  const broken = stylesheet.replace('vc-diagram[data-diagram-mode="reach"] .vc-diagram-marker', 'vc-diagram[data-diagram-mode="reach-x"] .vc-diagram-marker');
  expect(broken).not.toBe(stylesheet);
  const scene = reachScene();
  scene.database.click();
  scene.upstream.click();
  expect(markerShown(broken, scene.diagram, scene.marker)).toBe(true);
});

function statusAfter(selected: string, button: "What feeds this" | "What this feeds"): string {
  const { diagram, find } = harness();
  const svg = new Node("svg");
  const nodes = [graphNode("api", "API"), graphNode("queue", "Queue"), graphNode("database", "Database")];
  svg.append(...nodes, graphEdge("api", "queue"), graphEdge("queue", "database"));
  diagram.append(svg);
  diagram.connectedCallback();
  const tools = find("vc-diagram-tools");
  const control = tools.children.find((child) => child.textContent === button);
  const target = nodes.find((node) => node.getAttribute("data-node") === selected);
  if (!control || !target) throw new Error("Missing reach control or node");
  target.click();
  control.click();
  return find("vc-diagram-status").textContent;
}

test("a reach with no other node points the reader at the opposite direction", () => {
  expect(statusAfter("database", "What this feeds")).toBe("Database feeds these: nothing. Try What feeds this.");
  expect(statusAfter("api", "What feeds this")).toBe("Nothing feeds API. Try What this feeds.");
});

test("a reach that finds nodes keeps its plain wording, with no hint", () => {
  expect(statusAfter("database", "What feeds this")).toBe("These feed Database: Queue, API.");
  expect(statusAfter("api", "What this feeds")).toBe("API feeds these: Queue, Database.");
});

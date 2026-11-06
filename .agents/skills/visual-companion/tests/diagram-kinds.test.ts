/*
 * The tree, sequence and state diagram kinds, tested through one seam: the vc-diagram element in
 * the fake DOM. A test gives the element a text source and positions its nodes the way the CSS
 * grid would from their --rank and --lane; everything asserted is read back from what the element
 * rendered (node attributes, paths, labels, markers, notes). Expected values come from the diagram
 * spec: parents above children, messages in time order, a reply never a dependency, the five
 * geometry rules. No layout function is called here.
 */
import "./globals";
import { readFileSync } from "node:fs";
import { afterEach, expect, test } from "bun:test";
import { FakeEvent } from "./dom";
import { cleanup, harness, type Harness, Node, Observer, pathPoints, Tabs } from "./diagram-fixture";

afterEach(cleanup);

const BOX = { width: 120, height: 40 };
const COLUMN = 170;
const ROW = 100;
const LABEL = { width: 80, height: 18 };
const LANE_GAP = 32;
const RANK_GAP = 64;
// Space left of the first column in a browser at 656px, where the stage centres its grid.
const BROWSER_STAGE_LEFT = 142;
const MIN_ATTACH_GAP = 12;
const MIN_HEAD_GAP = 16;

interface Point { x: number; y: number }
interface Box { id: string; label: string; x: number; y: number; w: number; h: number }
interface Route { from: string; to: string; kind: string; points: Point[]; arrow: string }
interface Cell { rank: number; lane: number }
interface Shown extends Harness {
  stage: Node | undefined;
  boxes: Box[];
  routes: Route[];
  labels: Node[];
  lifelines: Node[];
  cells: Map<string, Cell>;
}

/** Sizes a real browser measured for one diagram, for tests that must reproduce its actual channels. */
interface Measured { box: { width: number; height: number }; label: (text: string) => { width: number; height: number } }

/**
 * Give the element a source, place its nodes as the CSS grid would from --rank and --lane, and read the render back.
 * Without `measured`, nodes and labels have one fixed size. With it they have the browser's sizes. Lanes sit the gap
 * apart that the element asks for in --vc-lane-gap, as the stylesheet does, or else a fixed pitch. `sizes` gives single
 * nodes their own width or height, as a browser does when labels differ in length; a node keeps the top-left of its cell.
 */
function show(source: string, tabs?: Tabs, measured?: Measured, sizes: Record<string, { width?: number; height?: number }> = {}): Shown {
  const fixture = harness();
  Object.assign(globalThis, { ResizeObserver: Observer });
  if (tabs) {
    fixture.ids.set("steps", tabs);
    fixture.diagram.setAttribute("for", "steps");
  }
  fixture.diagram.textContent = source;
  fixture.diagram.connectedCallback();
  const stage = fixture.find("vc-diagram-stage");
  const shown: Shown = { ...fixture, stage, boxes: [], routes: [], labels: [], lifelines: [], cells: new Map() };
  if (!stage) return shown;
  const kind = fixture.diagram.getAttribute("data-diagram-kind");
  const across = kind === "sequence" || fixture.diagram.getAttribute("data-dir") === "LR";
  const elements = stage.children.filter((child) => child.hasAttribute("data-node")) as Node[];
  shown.labels = stage.children.filter((child) => child.className === "vc-edge-label") as Node[];
  for (const label of shown.labels) label.rect = { left: 0, top: 0, ...(measured ? measured.label(label.textContent) : LABEL) };
  Observer.notify();
  const box = measured ? measured.box : BOX;
  const askedGap = stage.style.values.get("--vc-lane-gap");
  const laneGap = Number.parseFloat(askedGap ?? "");
  const fixedPitch = measured ? box.width + LANE_GAP : COLUMN;
  const columnPitch = laneGap > 0 ? box.width + laneGap : fixedPitch;
  const rowPitch = measured ? box.height + RANK_GAP : ROW;
  const stageLeft = measured ? BROWSER_STAGE_LEFT : 40;
  for (const element of elements) {
    const rank = Number(element.style.values.get("--rank"));
    const lane = Number(element.style.values.get("--lane"));
    shown.cells.set(element.getAttribute("data-node")!, { rank, lane });
    const column = across ? rank : lane;
    const row = kind === "sequence" ? 0 : across ? lane : rank;
    element.rect = { left: stageLeft + column * columnPitch, top: 40 + row * rowPitch, ...box, ...sizes[element.getAttribute("data-node")!] };
  }
  Observer.notify();
  shown.boxes = elements.map((element) => ({
    id: element.getAttribute("data-node")!, label: element.textContent,
    x: element.rect.left, y: element.rect.top, w: element.rect.width, h: element.rect.height,
  }));
  const svg = stage.children.find((child) => child.tagName === "svg")!;
  const definitions = svg.children.filter((child) => child.tagName === "defs");
  const markers = definitions.flatMap((defs) => defs.children).filter((child) => child.tagName === "marker");
  const paths = svg.children.filter((child) => child.hasAttribute("data-from"));
  shown.routes = paths.map((path) => {
    const reference = path.getAttribute("marker-end") ?? "";
    const marker = markers.find((candidate) => candidate.getAttribute("id") === reference.slice(5, -1));
    const arrow = marker ? `${marker.getAttribute("markerWidth")}x${marker.getAttribute("markerHeight")} ${marker.getAttribute("markerUnits")}` : "none";
    const points = pathPoints(path);
    return { from: path.getAttribute("data-from")!, to: path.getAttribute("data-to")!, kind: path.getAttribute("data-kind")!, points, arrow };
  });
  shown.lifelines = svg.children.filter((child) => child.getAttribute("class") === "vc-diagram-lifeline") as Node[];
  return shown;
}

function segments(route: Route): [Point, Point][] {
  return route.points.slice(1).map((end, index): [Point, Point] => [route.points[index]!, end]);
}

/** Total length over which two routes run along the same line. */
function sharedLength(a: Route, b: Route): number {
  let total = 0;
  for (const [p, q] of segments(a)) {
    for (const [r, s] of segments(b)) {
      if (p.y === q.y && r.y === s.y && p.y === r.y) total += Math.max(0, Math.min(Math.max(p.x, q.x), Math.max(r.x, s.x)) - Math.max(Math.min(p.x, q.x), Math.min(r.x, s.x)));
      if (p.x === q.x && r.x === s.x && p.x === r.x) total += Math.max(0, Math.min(Math.max(p.y, q.y), Math.max(r.y, s.y)) - Math.max(Math.min(p.y, q.y), Math.min(r.y, s.y)));
    }
  }
  return total;
}

/** Segments of different edges that run side by side, closer than `min` px but not on one line, for more than `over` px. */
function nearRails(routes: Route[], min = 14, over = 20): string[] {
  const found: string[] = [];
  routes.forEach((first, index) => {
    for (const second of routes.slice(index + 1)) {
      for (const [p, q] of segments(first)) {
        for (const [r, s] of segments(second)) {
          const vertical = p.x === q.x && r.x === s.x;
          const horizontal = p.y === q.y && r.y === s.y;
          if (!vertical && !horizontal) continue;
          const apart = vertical ? Math.abs(p.x - r.x) : Math.abs(p.y - r.y);
          const from = vertical ? Math.max(Math.min(p.y, q.y), Math.min(r.y, s.y)) : Math.max(Math.min(p.x, q.x), Math.min(r.x, s.x));
          const to = vertical ? Math.min(Math.max(p.y, q.y), Math.max(r.y, s.y)) : Math.min(Math.max(p.x, q.x), Math.max(r.x, s.x));
          if (apart > 0 && apart < min && to - from > over) found.push(`${first.from}>${first.to} ~ ${second.from}>${second.to}: ${apart}px apart for ${to - from}px`);
        }
      }
    }
  });
  return found;
}

/** Pairs of edges of different kinds that run along one line: one kind's line hides under the other's. */
function mixedKindOverlaps(routes: Route[]): string[] {
  const found: string[] = [];
  routes.forEach((first, index) => {
    for (const second of routes.slice(index + 1)) {
      if (first.kind !== second.kind && sharedLength(first, second) > 0) found.push(`${first.from}>${first.to} (${first.kind}) over ${second.from}>${second.to} (${second.kind})`);
    }
  });
  return found;
}

/** Edges with a zig-zag shorter than `min` px: a middle segment between two bends, too short to read as a deliberate turn. */
function jogs(routes: Route[], min = 10): string[] {
  const found: string[] = [];
  for (const route of routes) {
    const middle = segments(route).slice(1, -1);
    for (const [a, b] of middle) {
      const length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (length > 0 && length < min) found.push(`${route.from}>${route.to}: ${length}px`);
    }
  }
  return found;
}

function diagonals(routes: Route[]): string[] {
  const found: string[] = [];
  for (const route of routes) {
    for (const [a, b] of segments(route)) if (a.x !== b.x && a.y !== b.y) found.push(`${route.from}>${route.to}`);
  }
  return found;
}

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function labelBoxes(labels: Node[]): { text: string; x: number; y: number; w: number; h: number }[] {
  return labels.map((label) => {
    const centerX = Number.parseFloat(label.style.left);
    const centerY = Number.parseFloat(label.style.top);
    return { text: label.textContent, x: centerX - label.rect.width / 2, y: centerY - label.rect.height / 2, w: label.rect.width, h: label.rect.height };
  });
}

function labelCollisions(labels: Node[], boxes: Box[]): string[] {
  const found: string[] = [];
  const placed = labelBoxes(labels);
  placed.forEach((label, index) => {
    for (const box of boxes) if (overlaps(label, box)) found.push(`"${label.text}" on node ${box.label}`);
    for (const other of placed.slice(index + 1)) if (overlaps(label, other)) found.push(`"${label.text}" on label "${other.text}"`);
  });
  return found;
}

/** Labels sitting on an edge line, their own or another's: the reader would read such a label against the wrong line. */
function labelsOnLines(labels: Node[], routes: Route[]): string[] {
  const found: string[] = [];
  for (const label of labelBoxes(labels)) {
    for (const route of routes) {
      const hit = segments(route).some(([a, b]) => {
        const line = { x: Math.min(a.x, b.x) - 1, y: Math.min(a.y, b.y) - 1, w: Math.abs(a.x - b.x) + 2, h: Math.abs(a.y - b.y) + 2 };
        return overlaps(label, line);
      });
      if (hit) found.push(`"${label.text}" on ${route.from}>${route.to}`);
    }
  }
  return found;
}

function sideOf(point: Point, box: Box): string | null {
  const within = (value: number, from: number, size: number) => value >= from && value <= from + size;
  if (point.x === box.x && within(point.y, box.y, box.h)) return "left";
  if (point.x === box.x + box.w && within(point.y, box.y, box.h)) return "right";
  if (point.y === box.y && within(point.x, box.x, box.w)) return "top";
  if (point.y === box.y + box.h && within(point.x, box.x, box.w)) return "bottom";
  return null;
}

/**
 * Edges that meet a node on the same side must meet it at points at least `min` apart. Edges of
 * one kind fanning out of or into one side share a single point, which counts once. With
 * `headsOnly`, only the ends that carry an arrowhead count.
 */
function tightAttachments(routes: Route[], boxes: Box[], min = MIN_ATTACH_GAP, headsOnly = false): string[] {
  const bySide = new Map<string, number[]>();
  for (const route of routes) {
    const ends: [Point, string][] = [[route.points.at(-1)!, route.to]];
    if (!headsOnly) ends.unshift([route.points[0]!, route.from]);
    for (const [point, id] of ends) {
      const box = boxes.find((candidate) => candidate.id === id)!;
      const side = sideOf(point, box);
      if (!side) continue;
      const key = `${box.label} ${side}`;
      const along = side === "left" || side === "right" ? point.y : point.x;
      bySide.set(key, [...(bySide.get(key) ?? []), along]);
    }
  }
  const found: string[] = [];
  for (const [key, positions] of bySide) {
    const sorted = [...new Set(positions)].sort((a, b) => a - b);
    sorted.slice(1).forEach((value, index) => { if (value - sorted[index]! < min) found.push(`${key}: ${sorted[index]} and ${value}`); });
  }
  return found;
}

function behindBoxes(routes: Route[], boxes: Box[]): string[] {
  const found: string[] = [];
  for (const route of routes) {
    for (const box of boxes) {
      if (box.id === route.from || box.id === route.to) continue;
      for (const [a, b] of segments(route)) {
        const crosses = a.x === b.x
          ? a.x > box.x && a.x < box.x + box.w && Math.max(a.y, b.y) > box.y && Math.min(a.y, b.y) < box.y + box.h
          : a.y > box.y && a.y < box.y + box.h && Math.max(a.x, b.x) > box.x && Math.min(a.x, b.x) < box.x + box.w;
        if (crosses) found.push(`${route.from}>${route.to} behind ${box.label}`);
      }
    }
  }
  return found;
}

function labelOf(boxes: Box[], id: string): string {
  return boxes.find((box) => box.id === id)!.label;
}

const TREE = `tree
app[app/]
  src[src/]
    server[server.ts]
    routes[routes/]
    auth[auth/]
  tests[tests/]
    login_test[login.test.ts]
app -->|reads| @security config[config.json]
src -->|builds| @emphasis dist[dist/]
tests -->|runs| @async ci[ci.yml]`;

const SEQUENCE = `sequence
participant client as Client
participant api as API
participant cache as Cache
participant db as Database
client -> api: GET item 42
api -> cache: look up item 42
cache --> api: miss
api -> db: read item 42
db --> api: row
api ->> cache: store row
api --> client: item 42
api -> db: @security audit read`;

const STATE = `state
[*] --> placed
placed --> charging: submit
placed --> paid: free order
charging --> charging: timeout retry
charging --> @emphasis paid: card accepted
charging --> @security failed: declined
failed --> @async charging: customer retries
failed --> @return cancelled: customer gives up
paid --> shipped: packed
shipped --> [*]
cancelled --> [*]`;

const KINDS: [string, string][] = [["tree", TREE], ["sequence", SEQUENCE], ["state", STATE]];

for (const [kind, source] of KINDS) {
  test(`${kind}: every edge is right-angled`, () => {
    const { routes } = show(source);
    const lengths = routes.map((route) => route.points.length);
    expect(Math.min(...lengths)).toBeGreaterThan(1);
    expect(diagonals(routes)).toEqual([]);
  });

  test(`${kind}: no label sits on a node or on another label`, () => {
    const { labels, boxes } = show(source);
    expect(labels.length).toBeGreaterThan(1);
    expect(labelCollisions(labels, boxes)).toEqual([]);
  });

  test(`${kind}: edges on one side of a node attach at least 12px apart`, () => {
    const { routes, boxes } = show(source);
    expect(tightAttachments(routes, boxes)).toEqual([]);
  });

  test(`${kind}: arrowheads that end on one side sit at least 16px apart`, () => {
    const { routes, boxes } = show(source);
    expect(tightAttachments(routes, boxes, MIN_HEAD_GAP, true)).toEqual([]);
  });

  test(`${kind}: no edge zig-zags by less than 10px`, () => {
    const { routes } = show(source);
    expect(jogs(routes)).toEqual([]);
  });

  test(`${kind}: edges never run side by side closer than 14px, and a line of one kind never lies under another kind's`, () => {
    const { routes } = show(source);
    expect(nearRails(routes)).toEqual([]);
    expect(mixedKindOverlaps(routes)).toEqual([]);
  });

  test(`${kind}: every edge kind ends in the same arrowhead`, () => {
    const { routes } = show(source);
    const kinds = new Set(routes.map((route) => route.kind));
    const arrows = new Set(routes.map((route) => route.arrow));
    expect(kinds.size).toBeGreaterThanOrEqual(3);
    expect(arrows).toEqual(new Set(["10x10 userSpaceOnUse"]));
  });

  test(`${kind}: no edge passes behind a node it does not join`, () => {
    const { routes, boxes } = show(source);
    expect(behindBoxes(routes, boxes)).toEqual([]);
  });

  test(`${kind}: a layout that meets every rule shows no note`, () => {
    const { diagram, find } = show(source);
    expect(diagram.textContent).not.toContain("Layout warning");
    expect(find("vc-diagram-geometry")).toBeUndefined();
  });
}

// Straight edges

const KINDS_STATE = "state\n[*] --> a\na --> @emphasis b: main\na --> @security c: policy\nb --> @async d: later\nc --> @return d: back\nd --> [*]";

function isStraight(route: Route): boolean {
  const horizontal = route.points.every((point) => point.y === route.points[0]!.y);
  const vertical = route.points.every((point) => point.x === route.points[0]!.x);
  return horizontal || vertical;
}

test("state: an edge between boxes that overlap along the other axis runs straight, whatever else attaches to those boxes", () => {
  const kinds = show(KINDS_STATE);
  const [main] = pick(kinds.routes, [["a", "b"]]);
  expect(isStraight(main!)).toBe(true);
  const order = show(STATE);
  const straight = pick(order.routes, [["placed", "charging"], ["charging", "paid"], ["paid", "shipped"]]);
  straight.forEach((route) => expect(isStraight(route)).toBe(true));
});

test("flow: edges between boxes of slightly different sizes run straight", () => {
  const sizes = { client: { height: 39.97 }, lb: { height: 41.94 }, api: { height: 43.44 }, worker: { height: 44.89 }, db: { height: 43.23 } };
  const { routes } = show(BRANCHING, undefined, undefined, sizes);
  const straight = pick(routes, [["client", "lb"], ["lb", "api"], ["worker", "db"]]);
  straight.forEach((route) => expect(isStraight(route)).toBe(true));
});

// Labels on a shared trunk

test("state: where edges share a trunk, a label beside a branch's own bar belongs to that branch, and the straight edge's label keeps off the other bar", () => {
  const { routes, labels } = show(exampleDiagram("order-lifecycle-retry.html"), undefined, ORDER_IN_BROWSER);
  const [toFailed] = pick(routes, [["charging", "failed"]]);
  const bar = segments(toFailed!).find(([p, q]) => p.y === q.y)!;
  const barY = bar[0].y;
  const barLeft = Math.min(bar[0].x, bar[1].x);
  const barRight = Math.max(bar[0].x, bar[1].x);
  const placed = labelBoxes(labels);
  const near = (label: { x: number; y: number; w: number; h: number }) =>
    label.x + label.w > barLeft && label.x < barRight && Math.abs(label.y + label.h / 2 - barY) <= label.h + 4;
  const declined = placed.find((label) => label.text === "declined")!;
  const accepted = placed.find((label) => label.text === "card accepted")!;
  expect(near(declined)).toBe(true);
  expect(near(accepted)).toBe(false);
});

// Self-loops

test("state: a self-loop ends at a point of its own, away from the transitions that enter the same state", () => {
  const { routes } = show(STATE);
  const [loop] = pick(routes, [["charging", "charging"]]);
  const others = routes.filter((route) => route.to === "charging" && route !== loop);
  expect(others.length).toBeGreaterThanOrEqual(2);
  const tip = loop!.points.at(-1)!;
  for (const route of others) {
    const end = route.points.at(-1)!;
    expect(Math.hypot(end.x - tip.x, end.y - tip.y)).toBeGreaterThanOrEqual(MIN_HEAD_GAP);
    expect(sharedLength(loop!, route)).toBe(0);
  }
});

// Fan-out and fan-in

const FAN_OUT = "tree\na[A]\n  b[B]\n  c[C]\n  d[D]\na --> @security e[E]";
const FAN_IN = "state\n[*] --> a\na --> b\na --> c\nb --> d\nc --> d\nd --> [*]";

function startOf(route: Route): string {
  const point = route.points[0]!;
  return `${point.x},${point.y}`;
}

function endOf(route: Route): string {
  const point = route.points.at(-1)!;
  return `${point.x},${point.y}`;
}

function pick(routes: Route[], pairs: [string, string][]): Route[] {
  return pairs.map(([from, to]) => routes.find((route) => route.from === from && route.to === to)!);
}

/** Height of the first horizontal run of a route: the bar where a fan-out branches. */
function firstBarY(route: Route): number {
  return segments(route).find(([p, q]) => p.y === q.y)![0].y;
}

/** Height of the last horizontal run of a route: the bar where a fan-in joins. */
function lastBarY(route: Route): number {
  return segments(route).filter(([p, q]) => p.y === q.y).at(-1)![0].y;
}

test("fan-out: edges of one kind leave a box from one shared trunk and branch at one common bend halfway between the ranks", () => {
  const { routes, boxes } = show(FAN_OUT);
  const branches = pick(routes, [["a", "b"], ["a", "c"], ["a", "d"]]);
  expect(new Set(branches.map(startOf)).size).toBe(1);
  const start = branches[0]!.points[0]!;
  const bent = branches.filter((route) => segments(route).some(([p, q]) => p.y === q.y));
  expect(bent.length).toBeGreaterThanOrEqual(2);
  bent.forEach((route) => expect(segments(route)[0]![1].x).toBe(start.x));
  const bars = new Set(bent.map(firstBarY));
  expect(bars.size).toBe(1);
  const parent = boxes.find((box) => box.id === "a")!;
  const child = boxes.find((box) => box.id === "b")!;
  const halfway = (parent.y + parent.h + child.y) / 2;
  expect([...bars]).toEqual([halfway]);
});

test("fan-out: an edge of another kind from the same box has its own attach point and shares no line with the others", () => {
  const { routes } = show(FAN_OUT);
  const [security] = pick(routes, [["a", "e"]]);
  const defaults = pick(routes, [["a", "b"], ["a", "c"], ["a", "d"]]);
  expect(startOf(security!)).not.toBe(startOf(defaults[0]!));
  expect(Math.abs(security!.points[0]!.x - defaults[0]!.points[0]!.x)).toBeGreaterThanOrEqual(MIN_HEAD_GAP);
  defaults.forEach((route) => expect(sharedLength(security!, route)).toBe(0));
});

test("fan-in: edges of one kind meet a box at one shared point after one common bend", () => {
  const { routes } = show(FAN_IN);
  const merging = pick(routes, [["b", "d"], ["c", "d"]]);
  expect(new Set(merging.map(endOf)).size).toBe(1);
  const end = merging[0]!.points.at(-1)!;
  merging.forEach((route) => {
    expect(route.points.length).toBeGreaterThan(2);
    expect(segments(route).at(-1)![0].x).toBe(end.x);
  });
  expect(new Set(merging.map(lastBarY)).size).toBe(1);
});

test("fan-out in a state diagram also leaves by one trunk", () => {
  const { routes } = show(FAN_IN);
  const branches = pick(routes, [["a", "b"], ["a", "c"]]);
  expect(new Set(branches.map(startOf)).size).toBe(1);
  expect(new Set(branches.map(firstBarY)).size).toBe(1);
});

const BRANCHING = `flow
client[Client] --> lb[Load balancer] --> api[API]
api --> cache[Cache]
api --> queue[Queue]
queue -.-> worker[Worker] --> db[Database]
worker -->|retry| queue
worker --> @return api`;

test("flow: lines of different edges never run side by side closer than 14px, even when nodes differ in size by a few pixels", () => {
  const sizes = {
    client: { width: 68.4, height: 39.97 }, lb: { width: 65.5, height: 41.94 }, api: { width: 63.3, height: 43.44 }, cache: { width: 83, height: 39.27 },
    queue: { width: 103.5, height: 42.41 }, worker: { width: 100.4, height: 44.89 }, db: { width: 84.4, height: 43.23 },
  };
  const { routes } = show(BRANCHING, undefined, undefined, sizes);
  expect(nearRails(routes)).toEqual([]);
  expect(mixedKindOverlaps(routes)).toEqual([]);
});

test("state: two skip edges of different kinds around one box take opposite sides and share no line", () => {
  const { routes, boxes } = show("state\na --> b\nb --> c\na --> c\na --> @security c");
  const [plain, security] = routes.filter((route) => route.from === "a" && route.to === "c") as [Route, Route];
  const middle = boxes.find((box) => box.id === "b")!;
  const beside = (route: Route) => route.points.some((point) => point.x < middle.x) ? "left" : "right";
  expect(beside(plain)).not.toBe(beside(security));
  expect(mixedKindOverlaps(routes)).toEqual([]);
  expect(nearRails(routes)).toEqual([]);
  expect(behindBoxes(routes, boxes)).toEqual([]);
});

const CROWDED_STATES = [
  "state\na --> @async b\na --> @emphasis c\nb --> d\nc --> b\nb --> c",
  "state\na --> b\nb --> c\nb --> d\nb --> @emphasis d\na --> @emphasis c\nc --> a",
];

for (const source of CROWDED_STATES) {
  test(`state: edges of several kinds with transitions both ways share no line and never run side by side (${source.split("\n").length - 1} transitions)`, () => {
    const { routes, boxes } = show(source);
    expect(mixedKindOverlaps(routes)).toEqual([]);
    expect(nearRails(routes)).toEqual([]);
    expect(behindBoxes(routes, boxes)).toEqual([]);
    expect(diagonals(routes)).toEqual([]);
  });
}

// Tree

test("tree: a child is one rank below its parent and siblings run left to right in source order", () => {
  const { cells } = show(TREE);
  const rank = (id: string) => cells.get(id)!.rank;
  const lane = (id: string) => cells.get(id)!.lane;
  expect(["app", "src", "tests", "routes", "login_test"].map(rank)).toEqual([0, 1, 1, 2, 2]);
  expect(["server", "routes", "auth", "dist"].map(rank)).toEqual([2, 2, 2, 2]);
  expect(["config", "ci"].map(rank)).toEqual([1, 2]);
  expect(lane("server")).toBeLessThan(lane("routes"));
  expect(lane("routes")).toBeLessThan(lane("auth"));
  expect(lane("auth")).toBeLessThan(lane("dist"));
  expect(lane("src")).toBeLessThan(lane("tests"));
  expect(lane("tests")).toBeLessThan(lane("config"));
});

test("tree: a parent sits over its children and a subtree never reaches into its neighbour's columns", () => {
  const { cells } = show(TREE);
  const lane = (id: string) => cells.get(id)!.lane;
  const srcChildren = ["server", "routes", "auth", "dist"].map(lane);
  expect(lane("src")).toBeGreaterThanOrEqual(Math.min(...srcChildren));
  expect(lane("src")).toBeLessThanOrEqual(Math.max(...srcChildren));
  expect(Math.max(...srcChildren)).toBeLessThan(Math.min(lane("login_test"), lane("ci")));
});

test("tree: no two nodes share a cell", () => {
  const { cells } = show(TREE);
  const keys = [...cells.values()].map((cell) => `${cell.rank}:${cell.lane}`);
  expect(new Set(keys).size).toBe(keys.length);
});

test("tree: an indented outline and parent --> child lines build the same edges", () => {
  const outline = show("tree\na[A]\n  b[B]\n    c[C]\n  d[D]");
  const chains = show("tree\na[A] --> b[B] --> c[C]\na --> d[D]");
  const pairs = (shown: Shown) => shown.routes.map((route) => `${route.from}>${route.to}`);
  expect(pairs(outline)).toEqual(["a>b", "b>c", "a>d"]);
  expect(pairs(chains)).toEqual(pairs(outline));
});

test("tree: a second parent is reported and its edge left out", () => {
  const { diagram, routes } = show("tree\na[A]\n  c[C]\nb[B]\n  c");
  expect(diagram.textContent).toContain("Tree node c has more than one parent.");
  expect(routes.map((route) => `${route.from}>${route.to}`)).toEqual(["a>c"]);
});

test("tree: a cycle is reported and the edge that closes it left out", () => {
  const { diagram, routes } = show("tree\na[A] --> b[B] --> c[C]\nc --> a");
  expect(diagram.textContent).toContain("Tree cycle: c → a.");
  expect(routes.map((route) => `${route.from}>${route.to}`)).toEqual(["a>b", "b>c"]);
});

test("tree: 24 nodes with a wide fan-out still meet every geometry rule", () => {
  const leaves = Array.from({ length: 8 }, (_, index) => `    leaf${index}[Leaf ${index}]`).join("\n");
  const second = Array.from({ length: 9 }, (_, index) => `    twig${index}[Twig ${index}]`).join("\n");
  const source = `tree\nroot[Root]\n  left[Left]\n${leaves}\n  right[Right]\n${second}\n  other[Other]\n  more[More]\n  last[Last]\n  end[End]`;
  const { boxes, routes, labels, diagram } = show(source);
  expect(boxes).toHaveLength(24);
  expect(diagonals(routes)).toEqual([]);
  expect(tightAttachments(routes, boxes)).toEqual([]);
  expect(behindBoxes(routes, boxes)).toEqual([]);
  expect(labelCollisions(labels, boxes)).toEqual([]);
  expect(diagram.textContent).toContain("This diagram has 24 parts");
});

// Sequence

test("sequence: participants are columns in the order they appear", () => {
  const { boxes, cells } = show(SEQUENCE);
  expect(boxes.map((box) => box.label)).toEqual(["Client", "API", "Cache", "Database"]);
  expect(["client", "api", "cache", "db"].map((id) => cells.get(id)!.rank)).toEqual([0, 1, 2, 3]);
  expect(boxes.map((box) => box.y)).toEqual([40, 40, 40, 40]);
});

test("sequence: a participant used before it is declared takes its first appearance", () => {
  const { boxes } = show("sequence\na -> b: hi\nparticipant c as Third\nb --> a: ho");
  expect(boxes.map((box) => box.label)).toEqual(["a", "b", "Third"]);
});

test("sequence: messages run top to bottom in the order written, each a horizontal line between two lifelines", () => {
  const { routes, boxes } = show(SEQUENCE);
  const center = (id: string) => boxes.find((box) => box.id === id)!.x + BOX.width / 2;
  const expected: [string, string][] = [["client", "api"], ["api", "cache"], ["cache", "api"], ["api", "db"], ["db", "api"], ["api", "cache"], ["api", "client"], ["api", "db"]];
  expect(routes.map((route) => [route.from, route.to])).toEqual(expected);
  routes.forEach((route) => {
    expect(route.points).toHaveLength(2);
    expect(route.points[0]!.y).toBe(route.points[1]!.y);
    expect(route.points[0]!.x).toBe(center(route.from));
    expect(route.points[1]!.x).toBe(center(route.to));
  });
  const heights = routes.map((route) => route.points[0]!.y);
  const sorted = [...heights].sort((a, b) => a - b);
  expect(heights).toEqual(sorted);
  expect(new Set(heights).size).toBe(routes.length);
  expect(Math.min(...heights)).toBeGreaterThan(40 + BOX.height);
});

test("sequence: messages are at least 12px apart on a lifeline", () => {
  const { routes } = show(SEQUENCE);
  const heights = routes.map((route) => route.points[0]!.y);
  heights.slice(1).forEach((height, index) => expect(height - heights[index]!).toBeGreaterThanOrEqual(MIN_ATTACH_GAP));
});

test("sequence: each arrow kind follows its arrow, and an @kind on the text overrides it", () => {
  const { routes } = show(SEQUENCE);
  expect(routes.map((route) => route.kind)).toEqual(["default", "default", "return", "default", "return", "async", "return", "security"]);
});

test("sequence: a lifeline drops from each participant to below the last message", () => {
  const { routes, boxes, lifelines } = show(SEQUENCE);
  expect(lifelines).toHaveLength(4);
  const last = Math.max(...routes.map((route) => route.points[0]!.y));
  lifelines.forEach((line, index) => {
    const [from, to] = pathPoints(line);
    const box = boxes[index]!;
    expect(from).toEqual({ x: box.x + BOX.width / 2, y: box.y + box.h });
    expect(to!.x).toBe(from!.x);
    expect(to!.y).toBeGreaterThan(last);
  });
});

function lifelineXs(lifelines: Node[]): number[] {
  return lifelines.map((line) => pathPoints(line)[0]!.x);
}

test("sequence: no label crosses a lifeline, so a label beside a long message never sits on an intermediate participant's line", () => {
  const { labels, lifelines } = show(SEQUENCE);
  const lines = lifelineXs(lifelines);
  expect(lines).toHaveLength(4);
  for (const label of labelBoxes(labels)) {
    const crossed = lines.filter((x) => x > label.x && x < label.x + label.w);
    expect({ label: label.text, crossed }).toEqual({ label: label.text, crossed: [] });
  }
});

test("sequence: a label sits in the free span next to its message's origin, above the message", () => {
  const { labels, routes, boxes } = show(SEQUENCE);
  const center = (id: string) => boxes.find((box) => box.id === id)!.x + BOX.width / 2;
  const placed = labelBoxes(labels);
  const middleOf = (text: string) => {
    const label = placed.find((candidate) => candidate.text === text)!;
    return label.x + label.w / 2;
  };
  const [client, api, cache, db] = [center("client"), center("api"), center("cache"), center("db")];
  const spanApiCache = (api + cache) / 2;
  const spanDbCache = (db + cache) / 2;
  const spanClientApi = (client + api) / 2;
  expect(middleOf("read item 42")).toBe(spanApiCache);
  expect(middleOf("row")).toBe(spanDbCache);
  expect(middleOf("GET item 42")).toBe(spanClientApi);
  routes.forEach((route, index) => {
    const label = placed[index]!;
    const gap = route.points[0]!.y - (label.y + label.h);
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(12);
  });
});

test("sequence: a self message is reported and left out", () => {
  const { diagram, routes } = show("sequence\na -> b: hi\na -> a: thinking");
  expect(diagram.textContent).toContain("Self edge: a.");
  expect(routes).toHaveLength(1);
});

test("sequence: participants count toward the budget and messages do not", () => {
  const talkative = ["sequence", "a -> b: one", ...Array.from({ length: 30 }, (_, index) => `${index % 2 ? "b" : "a"} -> ${index % 2 ? "a" : "b"}: message ${index}`)].join("\n");
  const small = show(talkative);
  expect(small.routes).toHaveLength(31);
  expect(small.diagram.textContent).not.toContain("Consider splitting");

  const participants = (count: number) => ["sequence", ...Array.from({ length: count }, (_, index) => `participant p${index}`), "p0 -> p1: hello"].join("\n");
  const warned = show(participants(13));
  expect(warned.diagram.textContent).toContain("This diagram has 13 parts. Consider splitting it.");
  const limit = show(participants(24));
  expect(limit.boxes).toHaveLength(24);
  expect(limit.diagram.textContent).toContain("This diagram has 24 parts");
  const over = show(participants(25));
  expect(over.stage).toBeUndefined();
  expect(over.find("vc-diagram-error").textContent).toContain("Maximum 24 nodes; split the diagram.");
});

test("sequence: 24 participants keep every geometry rule", () => {
  const names = Array.from({ length: 24 }, (_, index) => `p${index}`);
  const messages = names.slice(1).map((name, index) => `${names[index]} ${index % 3 === 2 ? "-->" : "->"} ${name}: step ${index}`);
  const { routes, boxes, labels, diagram } = show(["sequence", ...names.map((name) => `participant ${name}`), ...messages].join("\n"));
  expect(boxes).toHaveLength(24);
  expect(routes).toHaveLength(23);
  expect(diagonals(routes)).toEqual([]);
  expect(behindBoxes(routes, boxes)).toEqual([]);
  expect(labelCollisions(labels, boxes)).toEqual([]);
  expect(diagram.textContent).not.toContain("Layout warning");
});

function depths(shown: Shown): Record<string, string> {
  const depth: Record<string, string> = {};
  for (const box of shown.boxes) {
    const element = shown.anchor(box.id);
    if (element.hasAttribute("data-reach-depth")) depth[box.label] = element.getAttribute("data-reach-depth")!;
  }
  return depth;
}

function reachFrom(shown: Shown, id: string, direction: "What this feeds" | "What feeds this"): Record<string, string> {
  shown.anchor(id).click();
  const tools = shown.find("vc-diagram-tools");
  const button = tools.children.find((child) => child.textContent === direction)!;
  button.click();
  return depths(shown);
}

test("sequence: reach runs over participants and a reply is never a dependency", () => {
  const down = reachFrom(show(SEQUENCE), "client", "What this feeds");
  expect(down).toEqual({ Client: "0", API: "1", Cache: "2", Database: "2" });
  const none = reachFrom(show(SEQUENCE), "client", "What feeds this");
  expect(none).toEqual({ Client: "0" });
  const up = reachFrom(show(SEQUENCE), "cache", "What feeds this");
  expect(up).toEqual({ Cache: "0", API: "1", Client: "2" });
});

// State

test("state: [*] edges join a Start and an End pill, shared by every initial or terminal edge", () => {
  const { boxes, routes } = show(STATE);
  expect(boxes.map((box) => box.label)).toEqual(["Start", "placed", "charging", "paid", "failed", "cancelled", "shipped", "End"]);
  const starts = routes.filter((route) => labelOf(boxes, route.from) === "Start");
  const ends = routes.filter((route) => labelOf(boxes, route.to) === "End");
  expect(starts).toHaveLength(1);
  expect(ends.map((route) => labelOf(boxes, route.from))).toEqual(["shipped", "cancelled"]);
});

test("state: states are layered by how far they are from the start and a branch stays beside its parent", () => {
  const { cells, boxes } = show(STATE);
  const byLabel = (label: string) => cells.get(boxes.find((box) => box.label === label)!.id)!;
  expect(["Start", "placed", "charging", "paid", "failed", "shipped", "cancelled", "End"].map((label) => byLabel(label).rank)).toEqual([0, 1, 2, 3, 3, 4, 4, 5]);
  expect(byLabel("paid").lane).toBeLessThan(byLabel("failed").lane);
  expect(byLabel("shipped").lane).toBeLessThan(byLabel("cancelled").lane);
});

test("state: a self-loop is drawn as a right-angled loop that starts and ends on its own state", () => {
  const { routes, boxes } = show(STATE);
  const loop = routes.find((route) => route.from === route.to)!;
  expect(loop).toBeDefined();
  const charging = boxes.find((box) => box.id === loop.from)!;
  expect(sideOf(loop.points[0]!, charging)).not.toBeNull();
  expect(sideOf(loop.points.at(-1)!, charging)).not.toBeNull();
  expect(loop.points.length).toBeGreaterThanOrEqual(3);
  expect(diagonals([loop])).toEqual([]);
});

test("state: a retry that loops back to an earlier state is right-angled and keeps clear of the states between", () => {
  const { routes, boxes } = show(STATE);
  const retry = routes.find((route) => labelOf(boxes, route.from) === "failed" && labelOf(boxes, route.to) === "charging")!;
  expect(retry).toBeDefined();
  expect(retry.points.length).toBeGreaterThanOrEqual(3);
  expect(diagonals([retry])).toEqual([]);
  expect(behindBoxes([retry], boxes)).toEqual([]);
});

test("state: a retry leaves and enters by the sides, so it never runs along the forward transition between the same states", () => {
  const { routes, boxes } = show(STATE);
  const retry = routes.find((route) => labelOf(boxes, route.from) === "failed" && labelOf(boxes, route.to) === "charging")!;
  const forward = routes.find((route) => labelOf(boxes, route.from) === "charging" && labelOf(boxes, route.to) === "failed")!;
  const failed = boxes.find((box) => box.label === "failed")!;
  const charging = boxes.find((box) => box.label === "charging")!;
  const leaves = sideOf(retry.points[0]!, failed);
  const enters = sideOf(retry.points.at(-1)!, charging);
  expect([leaves, enters].map((side) => side === "left" || side === "right")).toEqual([true, true]);
  expect(sharedLength(retry, forward)).toBe(0);
});

test("state: a transition that skips a rank goes around the state in between", () => {
  const { routes, boxes } = show(STATE);
  const skip = routes.find((route) => labelOf(boxes, route.from) === "placed" && labelOf(boxes, route.to) === "paid")!;
  expect(skip).toBeDefined();
  expect(skip.points.length).toBeGreaterThan(2);
  expect(behindBoxes([skip], boxes)).toEqual([]);
});

test("state: transitions take a label after a colon or between bars", () => {
  const { labels } = show("state\na --> b: first\nb -->|second| a");
  expect(labels.map((label) => label.textContent)).toEqual(["first", "second"]);
});

test("state: reach follows transitions through a retry cycle, ignores the self-loop and skips a reply", () => {
  const down = reachFrom(show(STATE), "failed", "What this feeds");
  expect(down).toEqual({ failed: "0", charging: "1", paid: "2", shipped: "3", End: "4" });
  const up = reachFrom(show(STATE), "paid", "What feeds this");
  expect(up).toEqual({ paid: "0", placed: "1", charging: "1", Start: "2", failed: "2" });
});

/** The source text of the first diagram in a shipped example. */
function exampleDiagram(file: string): string {
  const url = new URL(`../examples/${file}`, import.meta.url);
  const html = readFileSync(url, "utf8");
  return /<vc-diagram[^>]*>([\s\S]*?)<\/vc-diagram>/.exec(html)![1]!;
}

/** Node and label sizes Chromium measured for examples/order-lifecycle-retry.html at a 1100px window. */
const ORDER_LABEL_WIDTH: Record<string, number> = {
  submit: 46, "timeout retry": 81, "card accepted": 89, declined: 56, "customer retries": 101, "customer gives up": 112, packed: 49,
};
const ORDER_IN_BROWSER: Measured = {
  box: { width: 84, height: 40 },
  label: (text) => ({ width: ORDER_LABEL_WIDTH[text] ?? 8 * text.length + 8, height: 19 }),
};

test("state: the shipped order example shows no layout note at the sizes a browser gives it", () => {
  const { diagram, find } = show(exampleDiagram("order-lifecycle-retry.html"), undefined, ORDER_IN_BROWSER);
  expect(diagram.textContent).not.toContain("Layout warning");
  expect(find("vc-diagram-geometry")).toBeUndefined();
});

test("state: at the sizes a browser gives it, no label sits on a node, another label or an edge line", () => {
  const { labels, boxes, routes } = show(exampleDiagram("order-lifecycle-retry.html"), undefined, ORDER_IN_BROWSER);
  expect(labels).toHaveLength(7);
  expect(labelCollisions(labels, boxes)).toEqual([]);
  expect(labelsOnLines(labels, routes)).toEqual([]);
});

test("state: a self-loop leaves and returns by the free side of its state, and by the right when the left has no room", () => {
  const roomy = show(exampleDiagram("order-lifecycle-retry.html"), undefined, ORDER_IN_BROWSER);
  const [loop] = pick(roomy.routes, [["charging", "charging"]]);
  const charging = roomy.boxes.find((box) => box.id === "charging")!;
  expect(sideOf(loop!.points[0]!, charging)).toBe("left");
  expect(sideOf(loop!.points.at(-1)!, charging)).toBe("left");
  const cramped = show(STATE);
  const [tight] = pick(cramped.routes, [["charging", "charging"]]);
  const edge = cramped.boxes.find((box) => box.id === "charging")!;
  expect(sideOf(tight!.points[0]!, edge)).toBe("right");
  expect(sideOf(tight!.points.at(-1)!, edge)).toBe("right");
});

// Self-loops are valid in state only

test("a self-loop is reported and left out in every kind except state", () => {
  for (const source of ["tree\na[A] --> a", "sequence\nparticipant a\na -> a: again", "flow\na --> a"]) {
    const { diagram, routes } = show(source);
    expect(diagram.textContent).toContain("Self edge: a.");
    expect(routes).toHaveLength(0);
  }
  const state = show("state\na --> a: again");
  expect(state.diagram.textContent).not.toContain("Self edge");
  expect(state.routes.map((route) => `${route.from}>${route.to}`)).toEqual(["a>a"]);
});

// Boundary

test("bad lines in each kind stop the diagram and are numbered", () => {
  const cases: [string, string, string][] = [
    ["tree\na[A]\n  b[B", "Line 3:", "Invalid tree node."],
    ["sequence\na => b: x", "Line 2:", "Invalid sequence participant or message."],
    ["sequence\na -> b:", "Line 2:", "Invalid sequence participant or message."],
    ["state\na --> ", "Line 2:", "Invalid state transition."],
    ["state\na --> b: one\nb ==> a", "Line 3:", "Invalid state or transition."],
  ];
  for (const [source, line, why] of cases) {
    const { diagram, find, stage } = show(source);
    expect(stage).toBeUndefined();
    expect(find("vc-diagram-error").textContent).toContain(line);
    expect(find("vc-diagram-error").textContent).toContain(why);
    expect(diagram.textContent).toContain(source.split("\n")[1]!);
  }
});

test("a duplicate node in each kind is reported once and the first label wins", () => {
  const cases: [string, string, string][] = [
    ["tree\na[First]\n  b[B]\na[Second]", "a", "First"],
    ["sequence\nparticipant a as First\nparticipant a as Second\na -> b: x", "a", "First"],
    ["state\na[First] --> b\nb --> a[Second]", "a", "First"],
  ];
  for (const [source, id, label] of cases) {
    const { diagram, anchor } = show(source);
    expect(diagram.textContent).toContain(`Duplicate node: ${id}.`);
    expect(anchor(id).textContent).toBe(label);
  }
});

test("the legend lists only the edge kinds a diagram uses", () => {
  const { find } = show("sequence\na -> b: ask\nb --> a: answer");
  const legend = find("vc-diagram-legend");
  expect(legend.textContent).toContain("Request");
  expect(legend.textContent).toContain("Reply");
  expect(legend.textContent).not.toContain("Background");
  expect(legend.textContent).not.toContain("Policy");
});

test("the legend draws each line kind with the diagram's own arrowhead, so a dashed line never gets a dashed head", () => {
  const { find, stage } = show(STATE);
  const svg = stage!.children.find((child) => child.tagName === "svg")!;
  const markers = svg.children.filter((child) => child.tagName === "defs").flatMap((defs) => defs.children);
  const legend = find("vc-diagram-legend");
  const samples = legend.children.map((item) => item.children[0]!.children[0]!);
  expect(samples.map((sample) => sample.getAttribute("data-kind"))).toEqual(["default", "emphasis", "security", "async", "return"]);
  for (const sample of samples) {
    const reference = sample.getAttribute("marker-end") ?? "";
    const marker = markers.find((candidate) => candidate.getAttribute("id") === reference.slice(5, -1));
    expect(marker?.getAttribute("data-kind")).toBe(sample.getAttribute("data-kind"));
    expect(`${marker?.getAttribute("markerWidth")}x${marker?.getAttribute("markerHeight")} ${marker?.getAttribute("markerUnits")}`).toBe("10x10 userSpaceOnUse");
  }
});

const FOCUS: [string, string, string, string][] = [
  ["tree", TREE, "app", "src"],
  ["sequence", SEQUENCE, "client", "api"],
  ["state", STATE, "placed", "charging"],
];

for (const [kind, source, first, second] of FOCUS) {
  test(`${kind}: a selected tab lights the nodes it names and clears the previous step`, () => {
    const tabs = new Tabs();
    tabs.panels = [{ at: null, focus: [first, second] }, { at: null, focus: [second] }];
    const shown = show(source, tabs);
    expect(shown.diagram.getAttribute("data-diagram-mode")).toBe("step");
    expect(shown.anchor(first).hasAttribute("data-step-focus")).toBe(true);
    expect(shown.anchor(second).hasAttribute("data-step-focus")).toBe(true);
    tabs.select(1);
    expect(shown.anchor(first).hasAttribute("data-step-focus")).toBe(false);
    expect(shown.anchor(second).hasAttribute("data-step-focus")).toBe(true);
  });

  test(`${kind}: hovering a term lights its node and hovering the node lights the term`, () => {
    const shown = show(source);
    const term = new Node("vc-term");
    term.setAttribute("data-node", first);
    shown.terms.push(term);
    const target = shown.anchor(first);
    const enter = new FakeEvent("focusin");
    enter.target = term;
    shown.doc.dispatchEvent(enter);
    expect(target.hasAttribute("data-term-focus")).toBe(true);
    const leave = new FakeEvent("focusout");
    leave.target = term;
    shown.doc.dispatchEvent(leave);
    expect(target.hasAttribute("data-term-focus")).toBe(false);
    const hover = new FakeEvent("pointerover");
    hover.target = target;
    shown.doc.dispatchEvent(hover);
    expect(term.hasAttribute("data-term-focus")).toBe(true);
  });
}

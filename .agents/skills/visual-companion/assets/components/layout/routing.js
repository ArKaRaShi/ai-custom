const GAP = 12;
// An arrowhead is 10px wide: two heads on one side keep 6px of air between them when the side has room.
const ATTACH = 16;

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function blocked(a, b, boxes) {
  return boxes.some((r) => a.x === b.x
    ? a.x > r.x && a.x < r.x + r.w && Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.y + r.h
    : a.y > r.y && a.y < r.y + r.h && Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.x + r.w);
}

const BEND = 24;
const SHARED = 3;
// Lines of different edges closer than this, side by side, read as one doubled line.
const NEAR = 14;
const MIDLINE = 0.01;
// Attach points keep this far from a corner, unless a side is too short for its edges to fit.
const MARGIN = 8;

function push(heap, item) {
  heap.push(item);
  for (let i = heap.length - 1; i > 0;) {
    const up = (i - 1) >> 1;
    if (heap[up][0] <= heap[i][0]) break;
    [heap[up], heap[i]] = [heap[i], heap[up]];
    i = up;
  }
}

function pop(heap) {
  const top = heap[0], last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    for (let i = 0;;) {
      let smallest = i;
      for (const child of [2 * i + 1, 2 * i + 2]) if (child < heap.length && heap[child][0] < heap[smallest][0]) smallest = child;
      if (smallest === i) break;
      [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
      i = smallest;
    }
  }
  return top;
}

/**
 * The spans of earlier routes that run beside the step a-b, on its line or on a parallel line
 * closer than `NEAR`. Spans are filed by orientation and by `NEAR`-wide band of their line.
 */
function spansAlong(a, b, taken) {
  const vertical = a.x === b.x, at = vertical ? a.x : a.y, band = Math.floor(at / NEAR);
  const lo = vertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x), hi = vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
  const found = [];
  for (let near = band - 1; near <= band + 1; near++) {
    for (const span of taken.get(`${vertical ? "v" : "h"}${near}`) || []) {
      if (Math.abs(span.at - at) < NEAR && span.lo < hi && span.hi > lo) found.push(span);
    }
  }
  return found;
}

/**
 * True when the step a-b runs along the line of an edge that does not share this edge's start or
 * end attach point. Along the trunk of an edge that does (a fan-out or fan-in, drawn as one
 * line) it does not count.
 */
function crowds(a, b, taken, edge) {
  return spansAlong(a, b, taken).some((span) => span.start !== edge.start && span.end !== edge.end);
}

/**
 * Orthogonal route between two stub points over the grid of box edges, never through a box. It
 * costs length, a penalty per bend (so routes are straight where they can be), for an edge that
 * fans out of or into a shared attach point a small penalty for bending away from the midline
 * between the two stubs (so the branches of a fan bend together, halfway between the ranks) and
 * a penalty for each px that runs along another edge's route (so a retry does not hide under a
 * forward edge). `axes` are the axes the route leaves and enters on: 0 horizontal, 1 vertical.
 */
function pathBetween(start, end, boxes, taken, edge, axes) {
  const pull = edge.fan ? MIDLINE : 0;
  const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const xs = new Set([start.x, end.x]), ys = new Set([start.y, end.y]);
  if (edge.fan) { xs.add(middle.x); ys.add(middle.y); }
  for (const r of boxes) {
    xs.add(r.x - GAP); xs.add(r.x + r.w + GAP);
    ys.add(r.y - GAP); ys.add(r.y + r.h + GAP);
  }
  const x = [...xs].sort((a, b) => a - b), y = [...ys].sort((a, b) => a - b);
  const column = new Map(x.map((value, i) => [value, i])), row = new Map(y.map((value, j) => [value, j]));
  const state = (i, j, axis) => (i * y.length + j) * 2 + axis;
  const first = state(column.get(start.x), row.get(start.y), axes[0]);
  const spent = new Map([[first, 0]]), previous = new Map(), heap = [[0, first]];
  while (heap.length) {
    const [so_far, current] = pop(heap);
    if (so_far > spent.get(current)) continue;
    const axis = current % 2, cell = (current - axis) / 2, i = Math.floor(cell / y.length), j = cell % y.length;
    const a = { x: x[i], y: y[j] };
    for (const [ni, nj] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
      if (ni < 0 || nj < 0 || ni >= x.length || nj >= y.length) continue;
      const b = { x: x[ni], y: y[nj] };
      if (blocked(a, b, boxes)) continue;
      const next = ni === i ? 1 : 0, length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      const turn = next === axis ? 0 : BEND + pull * (next === 1 ? Math.abs(a.x - middle.x) : Math.abs(a.y - middle.y));
      const total = so_far + length * (crowds(a, b, taken, edge) ? 1 + SHARED : 1) + turn;
      const id = state(ni, nj, next);
      if (total >= (spent.get(id) ?? Infinity)) continue;
      spent.set(id, total); previous.set(id, current); push(heap, [total, id]);
    }
  }
  const target = [0, 1].map((axis) => ({ id: state(column.get(end.x), row.get(end.y), axis), axis }))
    .filter((option) => spent.has(option.id))
    .map((option) => ({ ...option, total: spent.get(option.id) + (option.axis === axes[1] ? 0 : BEND + pull * (axes[1] === 1 ? Math.abs(end.x - middle.x) : Math.abs(end.y - middle.y))) }))
    .sort((a, b) => a.total - b.total)[0];
  if (!target) return null;
  const points = [];
  for (let id = target.id; id !== undefined; id = previous.get(id)) {
    const cell = (id - (id % 2)) / 2;
    points.push({ x: x[Math.floor(cell / y.length)], y: y[cell % y.length] });
  }
  return points.reverse().filter((p, i, all) => i === 0 || i === all.length - 1 || (all[i - 1].x === p.x) !== (p.x === all[i + 1].x));
}

/**
 * The sides an edge leaves and enters by. A forward edge leaves the side facing its target. An
 * edge that loops back leaves by the side (top-down) or the facing end (left-right), so a retry
 * does not run along the forward edges. A self-loop leaves and returns by one side, chosen in
 * `routeFlow` once the other edges are placed.
 */
function sidesFor(edge, a, b, flow) {
  if (edge.from === edge.to) return ["right", "right"];
  if (flow === "LR") return b.x >= a.x + a.w ? ["right", "left"] : ["left", "right"];
  if (b.y >= a.y + a.h) return ["bottom", "top"];
  if (Math.abs(a.x - b.x) < 1) return ["right", "right"];
  return a.x > b.x ? ["left", "right"] : ["right", "left"];
}

const SLIDES = [0.5, 0.25, 0.75, 0, 1];

/** Label positions beside one segment: centred first, then slid along it, on both sides of the line. */
function labelSlots(a, b, size) {
  const horizontal = a.y === b.y;
  const lo = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
  const hi = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
  const length = horizontal ? size.w : size.h;
  const free = Math.max(0, hi - lo - length);
  const slots = [];
  for (const t of SLIDES) {
    if (!free && t !== 0.5) continue;
    const along = free ? lo + length / 2 + free * t : (lo + hi) / 2;
    if (horizontal) slots.push({ x: along, y: a.y - size.h / 2 - 4 }, { x: along, y: a.y + size.h / 2 + 4 });
    else slots.push({ x: a.x + size.w / 2 + 4, y: along }, { x: a.x - size.w / 2 - 4, y: along });
  }
  return slots;
}

const kindOf = (edge) => edge.kind || (edge.style === "dotted" ? "async" : "default");

/**
 * Where along a side of node `r` an edge would like to attach: the middle of the stretch `r`
 * shares with the box at the other end of the edge, so both ends choose the same coordinate and
 * the edge runs straight. Boxes that do not meet along that axis pull the edge toward each other.
 */
function wantedOffset(r, other, vertical) {
  const lo = vertical ? r.y : r.x, size = vertical ? r.h : r.w;
  const otherLo = vertical ? other.y : other.x, otherSize = vertical ? other.h : other.w;
  const from = Math.max(lo, otherLo) + MARGIN, to = Math.min(lo + size, otherLo + otherSize) - MARGIN;
  if (from <= to) return (from + to) / 2 - lo;
  return otherLo + otherSize / 2 < lo + size / 2 ? MARGIN : size - MARGIN;
}

/**
 * Offsets along a side as near their wishes as possible, `pitch` apart and inside the side.
 * Slots with equal wishes are ordered by `near` (the distance to the box at the other end), so
 * the edge to the nearest box keeps the straight position and the longer detour is moved aside.
 */
function spread(wishes, near, size, pitch) {
  const order = wishes.map((_, i) => i).sort((a, b) => wishes[a] - wishes[b] || near[a] - near[b] || a - b);
  const placed = new Array(wishes.length);
  let floor = 4 - pitch;
  for (const i of order) { floor = Math.max(wishes[i], floor + pitch); placed[i] = floor; }
  let ceiling = size - 4;
  for (const i of order.reverse()) { placed[i] = Math.min(placed[i], ceiling); ceiling = placed[i] - pitch; }
  return placed;
}

/**
 * The side a self-loop uses: the side of its node, right or left, that the fewest other edges
 * attach to, so its label has room and its arrowhead lands away from other arrowheads. The right
 * wins a tie; the left is used only when the node has room to its left for the label.
 */
function loopSide(edge, label, sides, edges, rect) {
  const used = (side) => edges.reduce((count, other, index) => {
    if (other.from === other.to) return count;
    return count + (other.from === edge.from && sides[index][0] === side) + (other.to === edge.from && sides[index][1] === side);
  }, 0);
  const room = rect.x >= (label ? label.w : 0) + 3 * GAP;
  return room && used("left") < used("right") ? "left" : "right";
}

export function routeFlow(graph, rects, flow, labelSizes) {
  const warnings = new Set(), sides = graph.edges.map((edge) => sidesFor(edge, rects.get(edge.from), rects.get(edge.to), flow));
  graph.edges.forEach((edge, index) => {
    if (edge.from === edge.to) { const side = loopSide(edge, labelSizes[index], sides, graph.edges, rects.get(edge.from)); sides[index] = [side, side]; }
  });
  // Edges of one kind that leave (or enter) one side of a node share one attach point, so a
  // fan-out is one trunk that branches, and a fan-in is branches that join into one trunk.
  const slots = new Map(), slotOf = graph.edges.map(() => []), faces = new Map();
  graph.edges.forEach((edge, index) => {
    [edge.from, edge.to].forEach((id, end) => {
      const side = sides[index][end], key = `${id}|${side}|${end}|${kindOf(edge)}`;
      if (!slots.has(key)) {
        slots.set(key, { id, side, items: [] });
        faces.set(`${id}|${side}`, [...(faces.get(`${id}|${side}`) || []), key]);
      }
      slots.get(key).items.push({ index, end });
      slotOf[index][end] = key;
    });
  });
  const points = graph.edges.map(() => []);
  for (const keys of faces.values()) {
    const first = slots.get(keys[0]), r = rects.get(first.id), side = first.side;
    const vertical = side === "left" || side === "right", size = vertical ? r.h : r.w;
    const sums = keys.map((key) => slots.get(key).items.reduce((total, { index, end }) => {
      const edge = graph.edges[index], other = rects.get(end ? edge.from : edge.to);
      return {
        wish: total.wish + wantedOffset(r, other, vertical),
        near: total.near + Math.abs(other.x + other.w / 2 - r.x - r.w / 2) + Math.abs(other.y + other.h / 2 - r.y - r.h / 2),
      };
    }, { wish: 0, near: 0 }));
    const counts = keys.map((key) => slots.get(key).items.length);
    const wishes = sums.map((sum, k) => sum.wish / counts[k]), near = sums.map((sum, k) => sum.near / counts[k]);
    const pitch = keys.length > 1 ? Math.min(ATTACH, (size - 8) / (keys.length - 1)) : ATTACH;
    if (pitch < GAP - 1e-9) warnings.add("attach points at least 12px apart");
    const offsets = spread(wishes, near, size, pitch);
    keys.forEach((key, k) => {
      const point = vertical
        ? { x: side === "left" ? r.x : r.x + r.w, y: r.y + offsets[k] }
        : { x: r.x + offsets[k], y: side === "top" ? r.y : r.y + r.h };
      for (const { index, end } of slots.get(key).items) points[index][end] = point;
    });
  }
  const boxes = [...rects.values()], drawn = [], taken = new Map();
  const axisOf = (side) => (side === "left" || side === "right" ? 0 : 1);
  graph.edges.forEach((edge, index) => {
    const [start, end] = points[index], [startSide, endSide] = sides[index];
    const stub = (p, side) => ({ x: p.x + (side === "left" ? -GAP : side === "right" ? GAP : 0), y: p.y + (side === "top" ? -GAP : side === "bottom" ? GAP : 0) });
    const first = stub(start, startSide), last = stub(end, endSide);
    const joins = { start: slotOf[index][0], end: slotOf[index][1] };
    joins.fan = slots.get(joins.start).items.length > 1 || slots.get(joins.end).items.length > 1;
    let middle = pathBetween(first, last, boxes, taken, joins, [axisOf(startSide), axisOf(endSide)]);
    if (!middle) { warnings.add("edges passing behind a non-endpoint node"); middle = [first, { x: last.x, y: first.y }, last]; }
    const route = [start, ...middle, end];
    const other = boxes.filter((_, i) => { const id = graph.nodes[i].id; return id !== edge.from && id !== edge.to; });
    if (route.slice(1).some((p, i) => blocked(route[i], p, other))) warnings.add("edges passing behind a non-endpoint node");
    route.slice(1).forEach((p, i) => {
      const a = route[i], vertical = a.x === p.x;
      const at = vertical ? a.x : a.y, key = `${vertical ? "v" : "h"}${Math.floor(at / NEAR)}`;
      const span = { index, ...joins, at, lo: vertical ? Math.min(a.y, p.y) : Math.min(a.x, p.x), hi: vertical ? Math.max(a.y, p.y) : Math.max(a.x, p.x) };
      taken.set(key, [...(taken.get(key) || []), span]);
    });
    drawn.push({ index, route });
  });
  // Labels are placed once every line is drawn, so a label can keep clear of a line routed after its
  // own. Beside its own line and clear of every line is preferred; failing that, a label may cross
  // another line but still never sits on a node or another label, which is the rule.
  const lines = [], labels = [];
  for (const { route } of drawn) {
    route.slice(1).forEach((p, i) => {
      const a = route[i];
      lines.push({ x: Math.min(a.x, p.x) - 1, y: Math.min(a.y, p.y) - 1, w: Math.abs(a.x - p.x) + 2, h: Math.abs(a.y - p.y) + 2 });
    });
  }
  // A label beside a trunk that several edges share could belong to any of them, so a label goes
  // beside a segment only its own edge draws when there is one.
  const shared = (route, i, index) => spansAlong(route[i - 1], route[i], taken).some((span) => span.index !== index);
  const order = (route, index) => Array.from({ length: route.length - 1 }, (_, i) => i + 1).sort((a, b) => shared(route, a, index) - shared(route, b, index));
  const place = (route, index, size, avoid) => {
    for (const i of order(route, index)) {
      for (const candidate of labelSlots(route[i - 1], route[i], size)) {
        const rect = { x: candidate.x - size.w / 2, y: candidate.y - size.h / 2, ...size };
        if (boxes.some((box) => intersects(rect, box)) || labels.some((box) => intersects(rect, box)) || avoid.some((box) => intersects(rect, box))) continue;
        labels.push(rect);
        return candidate;
      }
    }
    return null;
  };
  const routes = drawn.map(({ index, route }) => {
    const edge = graph.edges[index];
    let labelAt = null;
    if (edge.label) {
      const size = labelSizes[index] || { w: edge.label.length * 8 + 8, h: 18 };
      labelAt = place(route, index, size, lines) || place(route, index, size, []);
      if (!labelAt) { warnings.add("edge labels overlapping nodes or labels"); labelAt = route[1]; }
    }
    return { index, d: route.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" "), labelAt };
  });
  return { routes, warnings: [...warnings] };
}

const LABEL_GAP = 4;
const SPAN_PAD = 8;
const ROW_GAP = 28;
const TAIL = 24;

/**
 * Participants are columns, in the order they first appear. They share one row, so every lane
 * is 0 and the rank is the column.
 */
export function layoutSequence(graph) {
  const rank = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const lane = new Map(graph.nodes.map((node) => [node.id, 0]));
  return { rank, lane, back: new Set(), ranks: graph.nodes.length, lanes: 1 };
}

/**
 * The centre of the free span a label of `width` fits in without touching a lifeline. Spans are
 * the gaps between neighbouring lifelines, and between the stage's left or right bound and the
 * first or last lifeline.
 * The spans the message runs over come first, starting at its origin; the other spans follow,
 * nearest the origin first. Returns null when the label is wider than every span.
 */
function freeSpan(lines, bounds, from, to, width) {
  const spans = [];
  const edges = [bounds[0], ...lines, bounds[1]];
  edges.slice(1).forEach((end, index) => spans.push([edges[index], end]));
  const lo = Math.min(from, to), hi = Math.max(from, to);
  const along = spans.filter(([a, b]) => a >= lo - 0.5 && b <= hi + 0.5);
  const away = spans.filter((span) => !along.includes(span));
  const byOrigin = (a, b) => Math.abs((a[0] + a[1]) / 2 - from) - Math.abs((b[0] + b[1]) / 2 - from);
  const ordered = [...along.sort(byOrigin), ...away.sort(byOrigin)];
  const fit = ordered.find(([a, b]) => b - a >= width + 2 * SPAN_PAD);
  return fit ? (fit[0] + fit[1]) / 2 : null;
}

/**
 * Messages are horizontal rows below the participants, one per message in the order written,
 * each pitched by its label's height so labels never meet. Because every row lies below the
 * participant boxes and a message only joins two lifelines, no message can cross a box and no
 * two messages share an attach point. Every message has a label, placed above its line in a
 * span between lifelines so it never sits on a participant's line, next to the origin when the
 * message passes other participants.
 */
export function routeSequence(graph, rects, labelSizes) {
  const boxes = [...rects.values()];
  const lines = boxes.map((box) => box.x + box.w / 2).sort((a, b) => a - b);
  const bounds = [0, Math.max(...boxes.map((box) => box.x + box.w))];
  let y = Math.max(0, ...boxes.map((box) => box.y + box.h));
  const routes = graph.edges.map((edge, index) => {
    const from = rects.get(edge.from), to = rects.get(edge.to), size = labelSizes[index];
    const x1 = from.x + from.w / 2, x2 = to.x + to.w / 2;
    y += size.h + ROW_GAP;
    const centred = freeSpan(lines, bounds, x1, x2, size.w) ?? (x1 + x2) / 2;
    return { index, d: `M ${x1} ${y} L ${x2} ${y}`, labelAt: { x: centred, y: y - size.h / 2 - LABEL_GAP } };
  });
  const lifelines = boxes.map((box) => `M ${box.x + box.w / 2} ${box.y + box.h} L ${box.x + box.w / 2} ${y + TAIL}`);
  return { routes, warnings: [], lifelines, height: y + TAIL + 32 };
}

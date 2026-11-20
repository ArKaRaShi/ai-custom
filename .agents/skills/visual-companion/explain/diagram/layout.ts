/**
 * Async layout for a Diagram. elkjs ranks the nodes, routes every edge orthogonally and
 * places each edge label, so the view only draws the boxes and paths it returns.
 *
 * Layout is async: a promise resolves for the request it was given, and the caller keeps
 * the last result it asked for. Results are cached by request, so re-rendering a diagram
 * for a highlight change never runs the engine again.
 */
import type { ELK, ElkEdgeSection, ElkExtendedEdge, ElkLabel, ElkNode, ElkPoint } from "elkjs";
import ElkConstructor from "elkjs/lib/elk.bundled.js";
import type { DiagramDirection, DiagramEdge, DiagramNode } from "./graph.js";

/** Line spacing used to size and to draw a node label; both sides must agree. */
export const NODE_LINE_HEIGHT = 20;
/** Line spacing used to size and to draw an edge label. */
export const EDGE_LINE_HEIGHT = 16;

// Must match the font declarations for `.diagram-node-label` and `.diagram-edge-label` in diagram.css.
const NODE_FONT = "600 13px ui-sans-serif, system-ui, -apple-system, sans-serif";
const EDGE_FONT = "400 12px ui-sans-serif, system-ui, -apple-system, sans-serif";
const NODE_MAX_TEXT = 180;
const EDGE_MAX_TEXT = 150;
const NODE_PADDING_X = 16;
const NODE_PADDING_Y = 12;
const NODE_MIN_WIDTH = 88;
const EDGE_PADDING_X = 8;
const EDGE_PADDING_Y = 4;
const CACHE_LIMIT = 16;

export type LayoutRequest = { nodes: DiagramNode[]; edges: DiagramEdge[]; direction: DiagramDirection };

export type LaidNode = { id: string; x: number; y: number; w: number; h: number; lines: string[] };
export type LaidEdge = { id: string; source: string; target: string; d: string; label?: { x: number; y: number; w: number; h: number; lines: string[] } };
export type LaidGraph = { width: number; height: number; nodes: LaidNode[]; edges: LaidEdge[] };

/** A failed layout keeps its message, so the block can show why nothing was drawn. */
export type LayoutResult = { ok: true; laid: LaidGraph } | { ok: false; error: string };

const OPTIONS: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.edgeLabels.placement": "CENTER",
  "elk.padding": "[top=24,left=24,bottom=24,right=24]",
  "elk.spacing.nodeNode": "32",
  "elk.spacing.edgeNode": "28",
  "elk.spacing.edgeEdge": "20",
  "elk.layered.spacing.nodeNodeBetweenLayers": "64",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
};

let engine: ELK | undefined;
const layouts = new Map<string, LaidGraph>();

/** Identity of a layout request; the view uses it to ignore a result that arrived late. */
export function layoutKey(request: LayoutRequest): string {
  return JSON.stringify([request.direction, request.nodes, request.edges]);
}

let ruler: CanvasRenderingContext2D | null | undefined;
const widths = new Map<string, number>();

/**
 * Text width in px. Measured once per label through a canvas when the page has one;
 * without a DOM the 7px-per-character estimate still gives a finite, usable box.
 */
function widthOf(text: string, font: string): number {
  const key = `${font}\u0000${text}`;
  const known = widths.get(key);
  if (known !== undefined) return known;
  if (ruler === undefined) {
    ruler = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  }
  let width = text.length * 7;
  if (ruler) {
    ruler.font = font;
    width = ruler.measureText(text).width;
  }
  widths.set(key, width);
  return width;
}

/** Greedy word wrap; a word wider than the box is split by character so nothing overflows. */
function wrapLines(text: string, font: string, maxText: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || widthOf(candidate, font) <= maxText) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
  }
  if (line || !lines.length) lines.push(line);

  const wrapped: string[] = [];
  for (const item of lines) {
    if (widthOf(item, font) <= maxText) {
      wrapped.push(item);
      continue;
    }
    let current = "";
    for (const character of item) {
      if (current && widthOf(current + character, font) > maxText) {
        wrapped.push(current);
        current = character;
        continue;
      }
      current += character;
    }
    wrapped.push(current);
  }
  return wrapped;
}

/** A path command list for one edge; an orthogonal route has a bend point at every corner. */
function edgePath(sections: readonly ElkEdgeSection[]): string {
  const commands: string[] = [];
  for (const section of sections) {
    const points: ElkPoint[] = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
    for (const [index, point] of points.entries()) {
      const x = Math.round(point.x * 10) / 10;
      const y = Math.round(point.y * 10) / 10;
      commands.push(`${index === 0 ? "M" : "L"} ${x} ${y}`);
    }
  }
  return commands.join(" ");
}

/** Geometry sits on a 4px grid so bus lines and drops land on whole pixels. */
function snap(value: number): number {
  return Math.round(value / 4) * 4;
}

/**
 * ELK routes several edges that share one end badly: they leave (or reach) one point and then
 * run as near-parallel lines a few pixels apart, so the arrowheads of a fan-in stack on top of
 * each other and a parent sits over its leftmost child. The conventional drawing is one trunk,
 * one bus across the siblings and a short drop into each — for a fan-out and for a fan-in alike.
 * Both read the layout generically: siblings may sit at different depths inside their layer
 * (ELK centres them), so each drop ends at its own node and the bus runs in the gap before the
 * nearest one. A parent with no incoming edge is centred over the span it feeds.
 * A labelled edge keeps the engine's route, because its label was placed for that path.
 */
function routeTreeFans(nodes: LaidNode[], edges: LaidEdge[], direction: DiagramDirection): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const fed = new Set(edges.map((edge) => edge.target));
  const flowStart = (node: LaidNode) => (direction === "TB" ? node.y : node.x);
  const flowEnd = (node: LaidNode) => (direction === "TB" ? node.y + node.h : node.x + node.w);
  const crossCenter = (node: LaidNode) => (direction === "TB" ? node.x + node.w / 2 : node.y + node.h / 2);
  const crossMin = (node: LaidNode) => (direction === "TB" ? node.x : node.y);
  const crossMax = (node: LaidNode) => (direction === "TB" ? node.x + node.w : node.y + node.h);
  const tenth = (value: number) => Math.round(value * 10) / 10;
  /** One polyline from [flow, cross] points; TB reads them as (cross, flow). */
  const route = (points: [number, number][]) =>
    points
      .map(([flow, cross], index) => `${index === 0 ? "M" : "L"} ${direction === "TB" ? `${tenth(cross)} ${tenth(flow)}` : `${tenth(flow)} ${tenth(cross)}`}`)
      .join(" ");

  const outgoing = new Map<string, LaidEdge[]>();
  const incoming = new Map<string, LaidEdge[]>();
  for (const edge of edges) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge]);
  }
  const bundle = (group: LaidEdge[]) => group.length >= 2 && group.every((edge) => !edge.label && edge.source !== edge.target);
  const drawn = new Set<string>();

  for (const [sourceId, group] of outgoing) {
    if (!bundle(group)) continue;
    const source = byId.get(sourceId);
    const children = group.map((edge) => byId.get(edge.target));
    if (!source || children.some((child) => !child)) continue;
    const kids = children as LaidNode[];
    // Only children entirely downstream of the parent share a bus.
    const nearest = Math.min(...kids.map(flowStart));
    if (nearest <= flowEnd(source)) continue;

    if (!fed.has(sourceId)) {
      const span = (Math.min(...kids.map(crossMin)) + Math.max(...kids.map(crossMax))) / 2;
      const offset = snap(span - crossCenter(source));
      if (direction === "TB") source.x = Math.max(0, source.x + offset);
      else source.y = Math.max(0, source.y + offset);
    }
    const bus = snap((flowEnd(source) + nearest) / 2);
    const trunk = crossCenter(source);
    group.forEach((edge, index) => {
      const child = kids[index];
      if (!child) return;
      edge.d = route([
        [flowEnd(source), trunk],
        [bus, trunk],
        [bus, crossCenter(child)],
        [flowStart(child), crossCenter(child)],
      ]);
      drawn.add(edge.id);
    });
  }

  for (const [targetId, group] of incoming) {
    if (!bundle(group) || group.some((edge) => drawn.has(edge.id))) continue;
    const target = byId.get(targetId);
    const parents = group.map((edge) => byId.get(edge.source));
    if (!target || parents.some((parent) => !parent)) continue;
    const feeders = parents as LaidNode[];
    const furthest = Math.max(...feeders.map(flowEnd));
    if (furthest >= flowStart(target)) continue;
    const bus = snap((furthest + flowStart(target)) / 2);
    const entry = crossCenter(target);
    group.forEach((edge, index) => {
      const feeder = feeders[index];
      if (!feeder) return;
      edge.d = route([
        [flowEnd(feeder), crossCenter(feeder)],
        [bus, crossCenter(feeder)],
        [bus, entry],
        [flowStart(target), entry],
      ]);
    });
  }
}

export async function layoutGraph(request: LayoutRequest): Promise<LayoutResult> {
  const key = layoutKey(request);
  const known = layouts.get(key);
  if (known) return { ok: true, laid: known };

  const shapes = request.nodes.map((node) => {
    const lines = wrapLines(node.label, NODE_FONT, NODE_MAX_TEXT);
    const widest = Math.max(...lines.map((line) => widthOf(line, NODE_FONT)));
    return {
      node,
      lines,
      width: Math.max(NODE_MIN_WIDTH, Math.ceil(widest) + NODE_PADDING_X * 2),
      height: lines.length * NODE_LINE_HEIGHT + NODE_PADDING_Y * 2,
    };
  });
  const labels = request.edges.map((edge) => {
    const lines = edge.label ? wrapLines(edge.label, EDGE_FONT, EDGE_MAX_TEXT) : [];
    const widest = lines.length ? Math.max(...lines.map((line) => widthOf(line, EDGE_FONT))) : 0;
    return {
      lines,
      width: Math.ceil(widest) + EDGE_PADDING_X * 2,
      height: lines.length * EDGE_LINE_HEIGHT + EDGE_PADDING_Y * 2,
    };
  });

  if (!shapes.length) {
    const empty: LaidGraph = { width: 0, height: 0, nodes: [], edges: [] };
    return { ok: true, laid: empty };
  }

  // ELK keeps one id namespace for nodes, edges and labels, so the raw ids never travel
  // there: node and edge ids may repeat each other and may be any text.
  const nodeIndex = new Map(request.nodes.map((node, index) => [node.id, index]));
  const graph: ElkNode = {
    id: "diagram",
    layoutOptions: { ...OPTIONS, "elk.direction": request.direction === "TB" ? "DOWN" : "RIGHT" },
    children: shapes.map((shape, index) => ({ id: `n${index}`, width: shape.width, height: shape.height })),
    edges: request.edges.map((edge, index): ElkExtendedEdge => {
      const label = labels[index];
      const source = nodeIndex.get(edge.source) ?? 0;
      const target = nodeIndex.get(edge.target) ?? 0;
      const spec: ElkExtendedEdge = { id: `e${index}`, sources: [`n${source}`], targets: [`n${target}`] };
      if (label?.lines.length) {
        const placed: ElkLabel = { id: `l${index}`, text: edge.label ?? "", width: label.width, height: label.height };
        spec.labels = [placed];
      }
      return spec;
    }),
  };

  engine ??= new ElkConstructor();
  let result: ElkNode;
  try {
    result = await engine.layout(graph);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: reason || "the layout engine failed without a message" };
  }

  const boxed = new Map((result.children ?? []).map((child) => [child.id, child]));
  const routed = new Map((result.edges ?? []).map((edge) => [edge.id, edge]));
  const nodes: LaidNode[] = shapes.map((shape, index) => {
    const box = boxed.get(`n${index}`);
    return { id: shape.node.id, x: box?.x ?? 0, y: box?.y ?? 0, w: box?.width ?? shape.width, h: box?.height ?? shape.height, lines: shape.lines };
  });
  const edges: LaidEdge[] = request.edges.map((edge, index) => {
    const label = labels[index];
    const placed = routed.get(`e${index}`);
    const sections = placed?.sections ?? [];
    const laid: LaidEdge = { id: edge.id, source: edge.source, target: edge.target, d: edgePath(sections) };
    if (!label?.lines.length) return laid;

    // The engine places a declared label itself; mid-edge is the safe fallback if it did not.
    const first = sections[0];
    const anchor = placed?.labels?.[0];
    const midX = first ? (first.startPoint.x + first.endPoint.x) / 2 : 0;
    const midY = first ? (first.startPoint.y + first.endPoint.y) / 2 : 0;
    const x = anchor?.x ?? midX - label.width / 2;
    const y = anchor?.y ?? midY - label.height / 2;
    laid.label = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, w: label.width, h: label.height, lines: label.lines };
    return laid;
  });

  routeTreeFans(nodes, edges, request.direction);
  const width = Math.ceil(Math.max(result.width ?? 0, ...nodes.map((node) => node.x + node.w)));
  const height = Math.ceil(Math.max(result.height ?? 0, ...nodes.map((node) => node.y + node.h)));
  const laid: LaidGraph = { width, height, nodes, edges };

  layouts.set(key, laid);
  if (layouts.size > CACHE_LIMIT) {
    const oldest = layouts.keys().next();
    if (!oldest.done) layouts.delete(oldest.value);
  }
  return { ok: true, laid };
}

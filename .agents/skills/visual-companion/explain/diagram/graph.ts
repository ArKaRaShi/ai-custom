/** Diagram data, the problems found in it, and the reach used by the highlight modes. */

export type DiagramNode = { id: string; label: string };
export type DiagramEdge = { id: string; source: string; target: string; label?: string };
export type DiagramStep = { label: string; focus: string[] };
export type DiagramDirection = "LR" | "TB";

export type DiagramProps = {
  /** Accessible description of the whole diagram. */
  alt: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /** Reading direction of the ranked layout. Left to right unless set. */
  direction?: DiagramDirection;
  steps?: DiagramStep[];
};

/** Part count above which the diagram asks to be split. It still draws. */
export const PART_BUDGET = 9;

export type Graph = {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  steps: DiagramStep[];
  problems: string[];
};

/**
 * Drops the parts that cannot be drawn and lists each one, so malformed data shows up as
 * a sentence next to the diagram instead of an edge that silently disappears.
 */
export function readGraph(nodes: readonly DiagramNode[], edges: readonly DiagramEdge[], steps: readonly DiagramStep[]): Graph {
  const problems: string[] = [];
  const known = new Set<string>();
  const keptNodes: DiagramNode[] = [];
  for (const node of nodes) {
    if (!node.id.trim()) {
      problems.push("A node without an id is ignored.");
      continue;
    }
    if (known.has(node.id)) {
      problems.push(`Duplicate node id "${node.id}" is ignored.`);
      continue;
    }
    known.add(node.id);
    keptNodes.push(node);
  }

  const edgeIds = new Set<string>();
  const keptEdges: DiagramEdge[] = [];
  for (const edge of edges) {
    if (edgeIds.has(edge.id)) {
      problems.push(`Duplicate edge id "${edge.id}" is ignored.`);
      continue;
    }
    edgeIds.add(edge.id);
    const missing = [edge.source, edge.target].filter((id) => !known.has(id));
    if (missing.length) {
      problems.push(`Edge "${edge.id}" names unknown ${missing.length > 1 ? "nodes" : "node"} ${missing.map((id) => `"${id}"`).join(", ")} and is ignored.`);
      continue;
    }
    keptEdges.push(edge);
  }

  const keptSteps = steps.map((step) => {
    const focus = step.focus.filter((id) => known.has(id));
    const dropped = step.focus.filter((id) => !known.has(id));
    if (dropped.length)
      problems.push(`Step "${step.label}" focuses unknown ${dropped.length > 1 ? "nodes" : "node"} ${dropped.map((id) => `"${id}"`).join(", ")}.`);
    return { label: step.label, focus };
  });

  return { nodes: keptNodes, edges: keptEdges, steps: keptSteps, problems };
}

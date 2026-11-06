import { layoutFlow } from "./flow.js";

/**
 * Layered placement for a state machine. Ranks and the edges that loop back come from the flow
 * layout; within a rank, states are then ordered by the mean lane of the states that lead to
 * them, so a branch stays beside its parent and branches do not cross. States with no
 * predecessor keep source order after the others.
 */
export function layoutState(graph) {
  const flow = layoutFlow(graph);
  const leadsTo = new Map(graph.nodes.map((node) => [node.id, []]));
  graph.edges.forEach((edge, index) => { if (!flow.back.has(index)) leadsTo.get(edge.to).push(edge.from); });
  const rows = new Map();
  for (const node of graph.nodes) {
    const rank = flow.rank.get(node.id);
    rows.set(rank, [...(rows.get(rank) ?? []), node.id]);
  }
  const lane = new Map();
  let widest = 0;
  for (const rank of [...rows.keys()].sort((a, b) => a - b)) {
    const meanLane = (id) => {
      const sources = leadsTo.get(id).map((from) => lane.get(from));
      return sources.length ? sources.reduce((sum, value) => sum + value, 0) / sources.length : Infinity;
    };
    const order = rows.get(rank).map((id, source) => ({ id, source, mean: meanLane(id) }));
    order.sort((a, b) => (a.mean === b.mean ? 0 : a.mean < b.mean ? -1 : 1) || a.source - b.source);
    order.forEach((item, index) => lane.set(item.id, index));
    widest = Math.max(widest, order.length);
  }
  return { ...flow, lane, lanes: widest };
}

export function layoutFlow(graph) {
  const outgoing = new Map(graph.nodes.map((node) => [node.id, []]));
  graph.edges.forEach((edge, index) => outgoing.get(edge.from).push({ to: edge.to, index }));
  const state = new Map(), back = new Set(), order = [];
  const visit = (id) => {
    state.set(id, 1);
    for (const edge of outgoing.get(id)) {
      if (state.get(edge.to) === 1) back.add(edge.index);
      else if (!state.has(edge.to)) visit(edge.to);
    }
    state.set(id, 2); order.push(id);
  };
  for (const node of graph.nodes) if (!state.has(node.id)) visit(node.id);
  const rank = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const id of order.reverse()) for (const edge of outgoing.get(id)) {
    if (!back.has(edge.index)) rank.set(edge.to, Math.max(rank.get(edge.to), rank.get(id) + 1));
  }
  const counts = new Map(), lane = new Map();
  for (const node of graph.nodes) {
    const r = rank.get(node.id), n = counts.get(r) || 0;
    lane.set(node.id, n); counts.set(r, n + 1);
  }
  return { rank, lane, back, ranks: counts.size ? Math.max(...counts.keys()) + 1 : 0, lanes: counts.size ? Math.max(...counts.values()) : 0 };
}

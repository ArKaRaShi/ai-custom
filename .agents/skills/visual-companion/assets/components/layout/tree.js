/**
 * Top-down tree placement on the same rank/lane grid as the flow layout. A node's rank is its
 * depth and each leaf takes the next free lane, left to right in source order, so siblings
 * keep their order and no two nodes share a cell. A parent sits in the lane of the middle of
 * its children. The graph is a forest: the boundary has already removed second parents and
 * cycles.
 */
export function layoutTree(graph) {
  const children = new Map(graph.nodes.map((node) => [node.id, []]));
  const rooted = new Set();
  for (const edge of graph.edges) { children.get(edge.from).push(edge.to); rooted.add(edge.to); }
  const rank = new Map(), lane = new Map();
  let leaves = 0, ranks = 0;
  const place = (id, depth) => {
    rank.set(id, depth);
    ranks = Math.max(ranks, depth + 1);
    const below = children.get(id);
    if (!below.length) { lane.set(id, leaves++); return; }
    for (const child of below) place(child, depth + 1);
    lane.set(id, Math.floor((lane.get(below[0]) + lane.get(below.at(-1))) / 2));
  };
  for (const node of graph.nodes) if (!rooted.has(node.id)) place(node.id, 0);
  return { rank, lane, back: new Set(), ranks, lanes: leaves };
}

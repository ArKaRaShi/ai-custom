/** Every diagram kind a text source may name on its first line; docs, gallery, lint and tests derive from this list. */
export const DIAGRAM_KINDS = Object.freeze(["flow", "tree", "sequence", "state"]);

/** Edge kinds and the name each one has in the legend. */
export const EDGE_KINDS = Object.freeze({ default: "Request", emphasis: "Main path", return: "Reply", async: "Background", security: "Policy" });

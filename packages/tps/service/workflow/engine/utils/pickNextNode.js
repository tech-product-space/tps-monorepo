"use strict";

/**
 * Returns the destination node id of the (single) outgoing edge from `fromNodeId`.
 * For nodes with multiple outgoing edges (condition, ab_split), the handler is
 * expected to choose the specific next_node_id and return it explicitly.
 * For default linear flow we expect exactly one outgoing edge.
 */
function pickDefaultNextNode(fromNodeId, edges) {
  if (!Array.isArray(edges)) return null;
  const out = edges.filter((e) => e.from === fromNodeId);
  if (out.length === 0) return null;
  if (out.length === 1) return out[0].to;
  // Multiple outgoing edges — caller should have provided an explicit choice.
  // We return null here; advanceEnrollment will treat that as a config error.
  return null;
}

module.exports = { pickDefaultNextNode };

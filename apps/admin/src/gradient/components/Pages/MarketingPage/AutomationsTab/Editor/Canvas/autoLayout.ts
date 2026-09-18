import dagre from "dagre";

import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from "@/gradient/types/workflow";

/**
 * Positions for nodes that do not have one.
 *
 * Runs the first time a workflow built in the old linear editor is opened on
 * the canvas — those nodes were saved with a guessed `y` and no meaningful `x`,
 * so a branch would have drawn both paths on top of each other. Dagre lays it
 * out top-to-bottom and fans the branches sideways.
 *
 * Nodes that already carry a position are left exactly where they are. A layout
 * pass that moved somebody's hand-arranged canvas would be a bug, not a
 * feature.
 */

const NODE_WIDTH = 280;
const NODE_HEIGHT = 96;

export function autoLayout(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowNode[] {
  if (!nodes.length) return nodes;

  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 60 });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const edge of edges) {
    // An edge to a node that is not in the list would make dagre invent one.
    if (!nodes.some((n) => n.id === edge.from)) continue;
    if (!nodes.some((n) => n.id === edge.to)) continue;

    // Multigraph, keyed by label: a branch has two edges between the same pair
    // often enough that an unkeyed second one would silently replace the first.
    graph.setEdge(edge.from, edge.to, {}, edge.label || "default");
  }

  dagre.layout(graph);

  return nodes.map((node) => {
    if (node.position) return node;

    const laid = graph.node(node.id);
    if (!laid) return { ...node, position: { x: 0, y: 0 } };

    // Dagre reports centres; React Flow wants top-left.
    return {
      ...node,
      position: { x: laid.x - NODE_WIDTH / 2, y: laid.y - NODE_HEIGHT / 2 },
    };
  });
}

export function needsLayout(nodes: WorkflowNode[]): boolean {
  return nodes.some((n) => !n.position);
}

/**
 * Every node reachable from `start` by following edges forwards.
 *
 * Used twice: to shift a subtree down when a step is inserted above it, and to
 * prune whatever a delete orphaned.
 */
export function collectDescendants(
  start: string,
  edges: WorkflowEdge[],
  inclusive: boolean,
): Set<string> {
  const out = new Set<string>();
  if (inclusive) out.add(start);

  const queue = [start];
  const seen = new Set([start]);

  while (queue.length) {
    const current = queue.shift() as string;

    for (const edge of edges) {
      if (edge.from !== current) continue;
      if (seen.has(edge.to)) continue;

      seen.add(edge.to);
      out.add(edge.to);
      queue.push(edge.to);
    }
  }

  return out;
}

/**
 * The entry node, resolved the same way the backend resolves it.
 *
 * Explicit `entryNodeId` wins; otherwise the first node nothing points at;
 * otherwise the first node at all. Never an exit if anything else is available
 * — a workflow whose entry is its ending is a workflow that does nothing.
 */
export function resolveEntryId(definition: WorkflowDefinition): string | null {
  const nodes = definition?.nodes ?? [];
  if (!nodes.length) return null;

  if (definition.entryNodeId && nodes.some((n) => n.id === definition.entryNodeId)) {
    return definition.entryNodeId;
  }

  const hasIncoming = new Set((definition.edges ?? []).map((e) => e.to));

  return (
    nodes.find((n) => n.type !== "exit" && !hasIncoming.has(n.id))?.id ??
    nodes.find((n) => n.type !== "exit")?.id ??
    nodes[0]?.id ??
    null
  );
}

/**
 * Guarantee the workflow has an Exit, the way TPS does — but wired.
 *
 * TPS calls its `ensureExitExists` on load and after every canvas change, so a
 * brand-new workflow opens as Trigger → Exit and there is always something for
 * the last step to point at. That is the right feel: an automation ends, and
 * the ending should be on the canvas from the start rather than appearing once
 * you happen to add one.
 *
 * The one thing not copied is *where* it lands. TPS appends a free-floating
 * node, which its DAG validator permits because that validator has no
 * reachability check at all. Gradient's does — it refuses steps "not connected
 * to the rest of the workflow" — so a floating exit here would be an error
 * message about a step the admin never added. Instead the new exit is attached
 * to every dangling end, which is where it was going to be wired anyway.
 */
export function ensureExitExists(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  makeId: () => string,
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  if (nodes.some((n) => n.type === "exit")) return { nodes, edges };

  const lowest = nodes.reduce((max, n) => Math.max(max, n.position?.y ?? 0), 0);
  const column = nodes.find((n) => n.position)?.position?.x ?? 0;

  const exit: WorkflowNode = {
    id: makeId(),
    type: "exit",
    config: { reason: "completed" },
    position: { x: column, y: nodes.length ? lowest + 200 : 0 },
  };

  // Anything that can be walked to but leads nowhere. On an empty workflow
  // there is nothing to attach to and the exit stands alone — which is fine,
  // because it is then the entry node and nothing is orphaned.
  const dangling = nodes.filter(
    (n) => n.type !== "exit" && !edges.some((e) => e.from === n.id),
  );

  return {
    nodes: [...nodes, exit],
    edges: [...edges, ...dangling.map((n) => ({ from: n.id, to: exit.id }))],
  };
}

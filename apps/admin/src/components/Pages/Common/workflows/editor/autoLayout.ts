import dagre from "dagre";
import type { WorkflowEdge, WorkflowNode } from "@/types/workflow";

const NODE_WIDTH = 280;
const NODE_HEIGHT = 96;

/**
 * Run dagre to compute positions for nodes that don't have one. Used the
 * first time a legacy workflow opens in the canvas editor. Positions are
 * top-to-bottom; condition branches fan out horizontally.
 *
 * Returns a fresh node array with every node carrying a {x,y} position.
 */
export function autoLayout(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): WorkflowNode[] {
  if (nodes.length === 0) return nodes;

  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 60 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const e of edges) {
    if (!nodes.find((n) => n.id === e.from)) continue;
    if (!nodes.find((n) => n.id === e.to)) continue;
    g.setEdge(e.from, e.to, {}, e.label || "default");
  }

  dagre.layout(g);

  return nodes.map((n) => {
    if (n.position) return n;
    const laid = g.node(n.id);
    if (!laid) return { ...n, position: { x: 0, y: 0 } };
    return {
      ...n,
      position: {
        x: laid.x - NODE_WIDTH / 2,
        y: laid.y - NODE_HEIGHT / 2,
      },
    };
  });
}

export function needsLayout(nodes: WorkflowNode[]): boolean {
  return nodes.some((n) => !n.position);
}

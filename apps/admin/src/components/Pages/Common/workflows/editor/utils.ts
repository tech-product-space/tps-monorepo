import type {
  NodeType,
  WorkflowDraftDefinition,
  WorkflowEdge,
  WorkflowNode,
  NodeConfig,
} from "@/types/workflow";

export function newNodeId(): string {
  return "n_" + Math.random().toString(36).slice(2, 8);
}

export function defaultConfig(type: NodeType): NodeConfig {
  switch (type) {
    case "action.send_email":
      return {
        subject: "",
        html_body: "",
        from_email: "noreply@theproductspace.in",
        from_name: "The Product Space",
      };
    case "control.delay":
      return { duration_value: 1, duration_unit: "hours" };
    case "control.goal":
      return { goal_name: "completed" };
    case "control.condition":
      return {
        event_type: "email.opened",
        timeout_value: 1,
        timeout_unit: "days",
      };
    default:
      return {};
  }
}

export function nodeLabel(type: NodeType): string {
  switch (type) {
    case "action.send_email":
      return "Send Email";
    case "action.send_whatsapp":
      return "Send WhatsApp";
    case "control.delay":
      return "Wait";
    case "control.condition":
      return "If / then";
    case "control.ab_split":
      return "A/B Split";
    case "control.goal":
      return "Exit";
  }
}

/**
 * Linear-chain fallback. Only used when seeding edges for a brand-new
 * workflow or migrating a legacy workflow that doesn't have explicit edges
 * yet. In the canvas editor, user-drawn edges are the source of truth.
 */
export function linearEdges(nodes: WorkflowNode[]): WorkflowEdge[] {
  const out: WorkflowEdge[] = [];
  const lastGoal = [...nodes].reverse().find((n) => n.type === "control.goal");
  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i];
    const to = nodes[i + 1];
    if (from.type === "control.condition") {
      out.push({ from: from.id, to: to.id, label: "match" });
      const skipTarget = lastGoal && lastGoal.id !== from.id ? lastGoal.id : to.id;
      out.push({ from: from.id, to: skipTarget, label: "no_match" });
    } else {
      out.push({ from: from.id, to: to.id });
    }
  }
  return out;
}

/**
 * Ensure there is at least one Exit (control.goal) node. On a canvas with
 * branching, exits can sit anywhere — we only guarantee presence, not
 * position. New exits are placed below the lowest existing node so they
 * don't overlap.
 */
export function ensureExitExists(nodes: WorkflowNode[]): WorkflowNode[] {
  if (nodes.some((n) => n.type === "control.goal")) return nodes;
  const maxY = nodes.reduce(
    (m, n) => Math.max(m, n.position?.y ?? 0),
    0
  );
  const exit: WorkflowNode = {
    id: newNodeId(),
    type: "control.goal",
    config: defaultConfig("control.goal"),
    position: { x: 0, y: maxY + 160 },
  };
  return [...nodes, exit];
}

// Backward-compat shim — older imports still reference ensureGoalLast.
export const ensureGoalLast = ensureExitExists;

export function findExitNode(nodes: WorkflowNode[]): WorkflowNode | null {
  return nodes.find((n) => n.type === "control.goal") || null;
}

export function buildDraftDefinition(
  nodes: WorkflowNode[],
  edges?: WorkflowEdge[],
  entryNodeId?: string | null
): WorkflowDraftDefinition {
  return {
    nodes,
    edges: edges && edges.length > 0 ? edges : linearEdges(nodes),
    entry_node_id: entryNodeId ?? null,
  };
}

// Mirrors the backend's `utils/email/htmlHelpers.cleanHtml`. We strip the
// rich-text editor's quirks (white-space rules that break in Gmail/Outlook,
// <p> tags that some clients render with double spacing, broken font-family
// declarations) before persisting the email body. Doing it on the client at
// save time means the stored html_body is already what the engine will send.
export function cleanHtml(html: string): string {
  if (!html) return html;
  return html
    .replace(/white-space:\s*pre-wrap;?/g, "")
    .replace(/white-space:\s*pre;?/g, "")
    .replace(/<p\b[^>]*>/gi, "<div>")
    .replace(/<\/p>/gi, "</div>")
    .replace(
      /font-family:[^;"']+;?/gi,
      "font-family: Arial, Helvetica, sans-serif;"
    );
}

// Walk every send_email node and replace its html_body with the cleaned
// version. Pure — returns a new array.
export function cleanEmailNodes(nodes: WorkflowNode[]): WorkflowNode[] {
  return nodes.map((n) => {
    if (n.type !== "action.send_email") return n;
    const cfg = n.config as { html_body?: string } | undefined;
    if (!cfg?.html_body) return n;
    const cleaned = cleanHtml(cfg.html_body);
    if (cleaned === cfg.html_body) return n;
    return { ...n, config: { ...cfg, html_body: cleaned } };
  });
}

export const VERIFIED_SENDERS = [
  "info@theproductspace.in",
  "akhil@theproductspace.in",
  "noreply@theproductspace.in",
];

export const DURATION_UNITS = [
  { value: "seconds", label: "Seconds" },
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
] as const;

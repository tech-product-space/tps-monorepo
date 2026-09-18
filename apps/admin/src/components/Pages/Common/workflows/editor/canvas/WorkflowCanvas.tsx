"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  applyNodeChanges,
  type Node as RFNode,
  type Edge as RFEdge,
  type Connection,
  type OnConnect,
  type NodeChange,
  type EdgeMarker,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type {
  NodeType,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
} from "@/types/workflow";

import {
  StepNode,
  ConditionNode,
  TriggerNode,
  type CanvasNodeData,
  type TriggerNodeData,
} from "./CanvasNodes";
import {
  defaultConfig,
  ensureExitExists,
  findExitNode,
  newNodeId,
} from "../utils";
import { autoLayout, needsLayout } from "../autoLayout";
import { InsertableEdge, type InsertableEdgeData } from "./InsertableEdge";

const NODE_TYPES = {
  trigger: TriggerNode,
  step: StepNode,
  condition: ConditionNode,
};

const EDGE_TYPES = {
  insertable: InsertableEdge,
};

const TRIGGER_RF_ID = "__trigger";
const NEW_NODE_DY = 160;

type Props = {
  workflow: Workflow;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  entryNodeId: string | null;
  readOnly: boolean;
  theme?: "light" | "dark";
  onChange: (
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    entryNodeId: string | null
  ) => void;
  onEditNode: (id: string) => void;
  onSwitchToTrigger: () => void;
  isNodeIncomplete: (n: WorkflowNode) => boolean;
};

export default function WorkflowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({
  workflow,
  nodes: domainNodes,
  edges: domainEdges,
  entryNodeId,
  readOnly,
  theme = "light",
  onChange,
  onEditNode,
  onSwitchToTrigger,
  isNodeIncomplete,
}: Props) {
  // ─── Auto-layout if positions missing ───────────────────────────────
  const laidNodes = useMemo(() => {
    if (needsLayout(domainNodes)) {
      return autoLayout(domainNodes, domainEdges);
    }
    return domainNodes;
  }, [domainNodes, domainEdges]);

  const initialPushDone = useRef<string | null>(null);
  useEffect(() => {
    const key = laidNodes.map((n) => n.id).join("|");
    if (initialPushDone.current === key) return;
    if (needsLayout(domainNodes)) {
      initialPushDone.current = key;
      onChange(laidNodes, domainEdges, entryNodeId);
    } else {
      initialPushDone.current = key;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laidNodes]);

  // ─── Resolve entry: explicit if set, else first non-exit, else first ─
  const resolvedEntryId = useMemo<string | null>(() => {
    if (entryNodeId && laidNodes.find((n) => n.id === entryNodeId)) {
      return entryNodeId;
    }
    const firstNonExit = laidNodes.find((n) => n.type !== "control.goal");
    return firstNonExit ? firstNonExit.id : laidNodes[0]?.id ?? null;
  }, [entryNodeId, laidNodes]);

  const handleDelete = useCallback(
    (id: string) => {
      const deletedNode = domainNodes.find((n) => n.id === id);
      if (!deletedNode) return;

      // Ensure an Exit is around for the worst-case bridge.
      let nextNodes = ensureExitExists(domainNodes);
      const exit = findExitNode(nextNodes)!;

      // Pick a "bridge target" for predecessors of the deleted node:
      //   - condition: redirect to the YES branch's target (preserves that
      //     path; the No subtree gets pruned by the reachability sweep below)
      //   - regular step: redirect to whatever the node was outgoing to;
      //     falls back to Exit if it had no outgoing
      let bridgeTarget: string;
      if (deletedNode.type === "control.condition") {
        const yesEdge = domainEdges.find(
          (e) => e.from === id && e.label === "match"
        );
        bridgeTarget = yesEdge?.to ?? exit.id;
      } else {
        const outEdge = domainEdges.find((e) => e.from === id);
        bridgeTarget = outEdge?.to ?? exit.id;
      }

      const incomingEdges = domainEdges.filter((e) => e.to === id);

      // Drop the node and any edge touching it.
      let nextEdges = domainEdges.filter(
        (e) => e.from !== id && e.to !== id
      );
      nextNodes = nextNodes.filter((n) => n.id !== id);

      // Bridge each predecessor → bridgeTarget, preserving label so condition
      // Yes/No edges remain valid two-outgoing pairs.
      for (const inc of incomingEdges) {
        if (inc.from === bridgeTarget) continue;
        const alreadyExists = nextEdges.some(
          (e) =>
            e.from === inc.from &&
            e.to === bridgeTarget &&
            (inc.label ? e.label === inc.label : !e.label)
        );
        if (!alreadyExists) {
          nextEdges.push({
            from: inc.from,
            to: bridgeTarget,
            ...(inc.label ? { label: inc.label } : {}),
          });
        }
      }

      // Reachability prune. Unreachable nodes — including the orphaned No
      // subtree of a deleted condition (and its dedicated Exit) — disappear.
      let nextEntry = entryNodeId === id ? null : entryNodeId;
      const stillEntry =
        nextEntry && nextNodes.find((n) => n.id === nextEntry)
          ? nextEntry
          : nextNodes.find((n) => n.type !== "control.goal")?.id ?? null;

      if (stillEntry) {
        const reachable = collectDescendants(stillEntry, nextEdges, true);
        nextNodes = nextNodes.filter((n) => reachable.has(n.id));
        const surviving = new Set(nextNodes.map((n) => n.id));
        nextEdges = nextEdges.filter(
          (e) => surviving.has(e.from) && surviving.has(e.to)
        );
      }

      // Final guard: workflow must still have at least one Exit.
      nextNodes = ensureExitExists(nextNodes);

      onChange(nextNodes, nextEdges, nextEntry);
    },
    [domainNodes, domainEdges, entryNodeId, onChange]
  );

  // ─── Insert ON an existing edge ────────────────────────────────────
  // For a normal edge (A → B): A → new → B (label preserved on A → new).
  // For the trigger edge (Trigger → entry): Trigger → new → previousEntry,
  // and new becomes the new entry_node_id.
  // If the new node is a condition, also auto-link both branches to the
  // existing downstream target so neither branch is left dangling.
  const insertOnEdge = useCallback(
    (
      sourceId: string | null /* null = trigger edge */,
      targetId: string,
      label: "match" | "no_match" | undefined,
      type: NodeType
    ) => {
      if (readOnly) return;

      // ── Tidy spacing: place the new node where the target currently is,
      // then push target + everything reachable from it downward by one row
      // so the inserted step gets clean room. Descendants of the target on
      // separate branches also shift, which keeps the layout consistent.
      const ROW = NEW_NODE_DY + 40; // node height + breathing room

      const sourcePos =
        sourceId && domainNodes.find((n) => n.id === sourceId)?.position;
      const targetNode = domainNodes.find((n) => n.id === targetId);
      const targetPos = targetNode?.position;

      // Where to put the new node:
      //   * source-edge case → directly below source, target column
      //   * trigger-edge case → where target currently sits
      const newX = sourcePos ? sourcePos.x : (targetPos?.x ?? 0);
      const newY = sourcePos ? sourcePos.y + ROW : (targetPos?.y ?? 0);

      const downstream = collectDescendants(targetId, domainEdges, true);
      const shiftedNodes = domainNodes.map((n) =>
        downstream.has(n.id) && n.position
          ? { ...n, position: { x: n.position.x, y: n.position.y + ROW } }
          : n
      );

      const newNode: WorkflowNode = {
        id: newNodeId(),
        type,
        config: defaultConfig(type),
        position: { x: newX, y: newY },
      };

      let nextNodes = [...shiftedNodes, newNode];
      nextNodes = ensureExitExists(nextNodes);
      const exit = findExitNode(nextNodes)!;

      let nextEdges = [...domainEdges];

      if (sourceId) {
        // Remove the original (sourceId, [label]) → targetId edge.
        nextEdges = nextEdges.filter(
          (e) =>
            !(
              e.from === sourceId &&
              e.to === targetId &&
              (label ? e.label === label : !e.label)
            )
        );

        // sourceId → newNode (preserve label so condition branch still works)
        const inEdge: WorkflowEdge = { from: sourceId, to: newNode.id };
        if (label) inEdge.label = label;
        nextEdges.push(inEdge);

        // newNode → targetId — for non-branching new nodes only. Condition
        // gets its own labeled pair below.
        if (type !== "control.condition") {
          nextEdges.push({ from: newNode.id, to: targetId });
        }
      }

      // Condition node: Yes continues the existing flow (downstream target),
      // No gets its OWN dedicated Exit so the two paths are visually distinct
      // sub-branches. The user can re-wire either side later.
      if (type === "control.condition") {
        const yesTarget = targetId; // original downstream target

        const noExit: WorkflowNode = {
          id: newNodeId(),
          type: "control.goal",
          config: defaultConfig("control.goal"),
          position: { x: newX + 240, y: newY + ROW },
        };
        nextNodes.push(noExit);

        nextEdges.push({ from: newNode.id, to: yesTarget, label: "match" });
        nextEdges.push({ from: newNode.id, to: noExit.id, label: "no_match" });
      }

      // Trigger edge insertion: the new node becomes the entry, and it
      // forwards to the previous entry (which was `targetId`).
      let nextEntry = entryNodeId;
      if (!sourceId) {
        nextEntry = newNode.id;
        if (type !== "control.condition" && type !== "control.goal") {
          nextEdges.push({ from: newNode.id, to: targetId });
        }
      }

      onChange(nextNodes, nextEdges, nextEntry);
      if (type !== "control.goal") {
        setTimeout(() => onEditNode(newNode.id), 0);
      }
    },
    [domainNodes, domainEdges, entryNodeId, onChange, onEditNode, readOnly]
  );

  // ─── Build ReactFlow nodes ─────────────────────────────────────────
  const rfBuiltNodes = useMemo<RFNode[]>(() => {
    const summary = describeTrigger(workflow);
    const entry = laidNodes.find((n) => n.id === resolvedEntryId);
    const triggerX = entry?.position ? entry.position.x : 0;
    const triggerY = entry?.position ? entry.position.y - 200 : -200;

    const triggerData: TriggerNodeData = {
      title: summary.title,
      subtitle: summary.subtitle,
      configured: summary.configured,
      onClick: onSwitchToTrigger,
      readOnly,
      // Always mark trigger as "has outgoing" so its built-in "Add first
      // step" pill doesn't render — the inline edge "+" is the universal
      // way to insert.
      hasOutgoing: true,
      onAddStep: () => undefined,
    };

    const trig: RFNode = {
      id: TRIGGER_RF_ID,
      type: "trigger",
      position: { x: triggerX, y: triggerY },
      draggable: false,
      selectable: false,
      data: triggerData as unknown as Record<string, unknown>,
    };

    const incomingSet = new Set(domainEdges.map((e) => e.to));
    // The trigger arrow is synthesized (not a domain edge), so it isn't in
    // `domainEdges`. Treat the resolved entry as having an incoming connection
    // so its delete button doesn't show — that node is wired to the trigger.
    if (resolvedEntryId) incomingSet.add(resolvedEntryId);
    const stepRfNodes: RFNode[] = laidNodes.map((n) => {
      const data: CanvasNodeData = {
        workflowNode: n,
        readOnly,
        isIncomplete: isNodeIncomplete(n),
        onClick: onEditNode,
        onDelete: handleDelete,
        // Per-node pills are obsolete; the inline edge "+" replaces them.
        // Mark everything "has outgoing" so the pills stay hidden.
        onAddStep: () => undefined,
        hasOutgoing: true,
        hasMatchOutgoing: true,
        hasNoMatchOutgoing: true,
        hasIncoming: incomingSet.has(n.id),
      };
      return {
        id: n.id,
        type: n.type === "control.condition" ? "condition" : "step",
        position: n.position || { x: 0, y: 0 },
        data: data as unknown as Record<string, unknown>,
      };
    });

    return [trig, ...stepRfNodes];
  }, [
    workflow,
    laidNodes,
    resolvedEntryId,
    readOnly,
    onEditNode,
    onSwitchToTrigger,
    handleDelete,
    isNodeIncomplete,
  ]);

  // ─── Build ReactFlow edges ─────────────────────────────────────────
  const rfBuiltEdges = useMemo<RFEdge[]>(() => {
    const out: RFEdge[] = [];

    // Trigger → entry (synthesized; not persisted as a normal edge).
    if (resolvedEntryId) {
      const triggerEdgeData: InsertableEdgeData = {
        readOnly,
        variant: "trigger",
        onInsert: (type) =>
          insertOnEdge(null, resolvedEntryId, undefined, type),
      };
      out.push({
        id: `${TRIGGER_RF_ID}-to-${resolvedEntryId}`,
        source: TRIGGER_RF_ID,
        target: resolvedEntryId,
        type: "insertable",
        deletable: false,
        selectable: false,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#7c3aed",
          width: 16,
          height: 16,
        },
        data: triggerEdgeData as unknown as Record<string, unknown>,
      });
    }

    for (const e of domainEdges) {
      const isMatch = e.label === "match";
      const isNoMatch = e.label === "no_match";
      const stroke = isMatch ? "#10b981" : isNoMatch ? "#f43f5e" : "#64748b";
      const edgeData: InsertableEdgeData = {
        readOnly,
        variant: isMatch ? "match" : isNoMatch ? "no_match" : "default",
        onInsert: (type) => insertOnEdge(e.from, e.to, e.label, type),
      };
      out.push({
        id: `${e.from}-${e.label || "-"}->${e.to}`,
        source: e.from,
        target: e.to,
        sourceHandle: e.label || undefined,
        type: "insertable",
        label: isMatch ? "Yes" : isNoMatch ? "No" : undefined,
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
        labelBgStyle: isMatch
          ? { fill: "#ecfdf5", stroke: "#bbf7d0" }
          : isNoMatch
          ? { fill: "#fff1f2", stroke: "#fecaca" }
          : undefined,
        labelStyle: isMatch
          ? { fill: "#047857", fontWeight: 600, fontSize: 11 }
          : isNoMatch
          ? { fill: "#be123c", fontWeight: 600, fontSize: 11 }
          : undefined,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: stroke,
          width: 16,
          height: 16,
        },
        data: edgeData as unknown as Record<string, unknown>,
      });
    }

    return out;
  }, [resolvedEntryId, domainEdges, readOnly, insertOnEdge]);

  const [rfNodes, setRfNodes] = useNodesState(rfBuiltNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(rfBuiltEdges);

  useEffect(() => {
    setRfNodes(rfBuiltNodes);
  }, [rfBuiltNodes, setRfNodes]);
  useEffect(() => {
    setRfEdges(rfBuiltEdges);
  }, [rfBuiltEdges, setRfEdges]);

  // ─── Position persistence ──────────────────────────────────────────
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setRfNodes((cur) => applyNodeChanges(changes, cur));
      const dragStops = changes.filter(
        (c) => c.type === "position" && (c as any).dragging === false
      );
      if (dragStops.length === 0) return;

      const movedIds = new Set(dragStops.map((c) => (c as any).id as string));
      const nextDomain = domainNodes.map((n) => {
        if (!movedIds.has(n.id)) return n;
        const change = dragStops.find((c) => (c as any).id === n.id) as any;
        const pos = change?.position;
        if (!pos) return n;
        return { ...n, position: { x: pos.x, y: pos.y } };
      });
      onChange(nextDomain, domainEdges, entryNodeId);
    },
    [domainNodes, domainEdges, entryNodeId, onChange, setRfNodes]
  );

  // ─── Manual edge connect (rewiring) ───────────────────────────────
  const handleConnect: OnConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      if (conn.target === TRIGGER_RF_ID) return;
      if (conn.source === conn.target) return;

      if (conn.source === TRIGGER_RF_ID) {
        if (!domainNodes.find((n) => n.id === conn.target)) return;
        onChange(domainNodes, domainEdges, conn.target);
        return;
      }

      const fromNode = domainNodes.find((n) => n.id === conn.source);
      const isCondition = fromNode?.type === "control.condition";

      const filtered = domainEdges.filter((e) => {
        if (e.from !== conn.source) return true;
        if (isCondition) return e.label !== conn.sourceHandle;
        return false;
      });

      const newEdge: WorkflowEdge = { from: conn.source, to: conn.target };
      if (isCondition && conn.sourceHandle) {
        newEdge.label = conn.sourceHandle as "match" | "no_match";
      }
      onChange(domainNodes, [...filtered, newEdge], entryNodeId);
    },
    [domainNodes, domainEdges, entryNodeId, onChange]
  );

  const handleEdgesDelete = useCallback(
    (removed: RFEdge[]) => {
      const nextEdges = domainEdges.filter((e) => {
        for (const r of removed) {
          if (r.source === TRIGGER_RF_ID) return true;
          if (e.from === r.source && e.to === r.target) {
            if (r.sourceHandle && e.label !== r.sourceHandle) continue;
            return false;
          }
        }
        return true;
      });
      onChange(domainNodes, nextEdges, entryNodeId);
    },
    [domainNodes, domainEdges, entryNodeId, onChange]
  );

  const isDark = theme === "dark";
  return (
    <div
      className={`h-[720px] border rounded-md overflow-hidden bg-white dark:bg-zinc-900 dark:border-zinc-700 ${
        isDark ? "dark" : ""
      }`}
    >
      {/* Scoped overrides for ReactFlow chrome — only apply inside a .dark
          canvas so the rest of the admin keeps its light look. */}
      <style>{CANVAS_DARK_CSS}</style>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onEdgesDelete={handleEdgesDelete}
        onNodeClick={(_e, node) => {
          if (node.id === TRIGGER_RF_ID) onSwitchToTrigger();
        }}
        fitView
        fitViewOptions={{ padding: 0.25, minZoom: 0.5, maxZoom: 1.4 }}
        minZoom={0.2}
        maxZoom={2}
        defaultEdgeOptions={DEFAULT_EDGE}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        edgesReconnectable={!readOnly}
        deleteKeyCode={readOnly ? null : ["Delete", "Backspace"]}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          gap={20}
          size={1}
          color={isDark ? "#3f3f46" : "#e5e7eb"}
        />
        <MiniMap pannable zoomable className="!bg-zinc-50 dark:!bg-zinc-800" />
        <Controls className="!shadow-none !border" />
      </ReactFlow>
    </div>
  );
}

// Override ReactFlow's built-in chrome (Controls buttons, MiniMap viewport,
// edge labels, handle dots) for the dark variant. Targets the `.dark` class
// the canvas wrapper applies, so these rules never bleed outside the canvas.
const CANVAS_DARK_CSS = `
.dark .react-flow {
  background: rgb(24 24 27);
}
.dark .react-flow__controls {
  background: rgb(39 39 42);
  border-color: rgb(63 63 70) !important;
}
.dark .react-flow__controls-button {
  background: rgb(39 39 42);
  border-bottom: 1px solid rgb(63 63 70);
  color: rgb(228 228 231);
  fill: rgb(228 228 231);
}
.dark .react-flow__controls-button:hover {
  background: rgb(63 63 70);
}
.dark .react-flow__minimap-mask {
  fill: rgba(24, 24, 27, 0.7);
}
.dark .react-flow__edge-text {
  fill: rgb(228 228 231);
}
.dark .react-flow__handle {
  background: rgb(39 39 42);
  border-color: rgb(113 113 122);
}
.dark .react-flow__edge-textbg {
  fill: rgb(39 39 42);
}
`;

// ──────────────────────────────────────────────────────────────────────────

const DEFAULT_EDGE = {
  type: "insertable",
  animated: false,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: "#64748b",
    width: 16,
    height: 16,
  } as EdgeMarker,
};

// BFS over forward edges; returns the set of node ids reachable from `start`
// (inclusive of start when `inclusive`). Used to shift a target node + its
// downstream subtree when inserting on an edge.
function collectDescendants(
  start: string,
  edges: WorkflowEdge[],
  inclusive: boolean
): Set<string> {
  const out = new Set<string>();
  if (inclusive) out.add(start);
  const queue: string[] = [start];
  const seen = new Set<string>([start]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of edges) {
      if (e.from !== cur) continue;
      if (seen.has(e.to)) continue;
      seen.add(e.to);
      out.add(e.to);
      queue.push(e.to);
    }
  }
  return out;
}

function describeTrigger(workflow: Workflow) {
  const t = workflow.trigger_config;
  if (!t) {
    return {
      configured: false,
      title: "Trigger not set",
      subtitle: "Click to choose how leads enter this workflow.",
    };
  }
  if (t.type === "trigger.new_lead") {
    return {
      configured: true,
      title: "When a new lead arrives",
      subtitle: "Auto-enrolls matching new leads.",
    };
  }
  if (t.type === "trigger.static_list") {
    return {
      configured: true,
      title: "Static list",
      subtitle: "Enrolls a one-time list on run.",
    };
  }
  return {
    configured: false,
    title: "Trigger",
    subtitle: "Click to configure",
  };
}

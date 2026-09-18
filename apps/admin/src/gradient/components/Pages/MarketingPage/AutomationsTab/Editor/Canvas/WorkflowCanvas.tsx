"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge as RFEdge,
  type EdgeMarker,
  type Node as RFNode,
  type NodeChange,
  type OnConnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type {
  NodeConfig,
  Workflow,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeType,
} from "@/gradient/types/workflow";

import {
  BranchNode,
  StepNode,
  TriggerNode,
  type CanvasNodeData,
  type TriggerNodeData,
} from "./CanvasNodes";
import { InsertableEdge, VARIANT_STROKE, type InsertableEdgeData } from "./InsertableEdge";
import {
  autoLayout,
  collectDescendants,
  ensureExitExists,
  needsLayout,
  resolveEntryId,
} from "./autoLayout";
import StepConfigSheet from "../StepConfigSheet";
import { defaultConfig, isStepIncomplete, newNodeId } from "../stepHelpers";
import { describeTrigger } from "../../describeTrigger";

const NODE_TYPES = { trigger: TriggerNode, step: StepNode, branch: BranchNode };
const EDGE_TYPES = { insertable: InsertableEdge };

/** The synthesised trigger card. Never stored, so it needs an id nothing else
 *  can collide with. */
const TRIGGER_RF_ID = "__trigger";

/** One row: node height plus breathing room. */
const ROW = 200;

interface Props {
  workflow: Workflow;
  definition: WorkflowDefinition;
  onChange: (definition: WorkflowDefinition) => void;
  onSwitchToTrigger: () => void;
  readOnly?: boolean;
  theme?: "light" | "dark";
}

/**
 * The branching editor.
 *
 * Built to match the TPS canvas, because the team already knows that one and
 * an automation editor that behaves *almost* like the familiar one is worse
 * than either. Same trigger-first layout, same insert-on-the-arrow interaction,
 * same card shapes, same smart delete, same dark mode.
 *
 * Three things about it are worth knowing before changing anything:
 *
 * 1. **The trigger is drawn but never stored.** It is a synthetic node with a
 *    synthetic dashed edge to the entry step, so the canvas reads the way the
 *    journey runs — somebody enters, then things happen. Clicking it jumps to
 *    the Trigger tab; it cannot be dragged, deleted or configured here.
 * 2. **Steps are added by clicking the "+" on an arrow, not from a toolbar.**
 *    The question is never "add a step" in the abstract, it is "add a step
 *    *here*", and dropping a node into a corner and wiring it up afterwards is
 *    two problems instead of none.
 * 3. **Deleting bridges rather than tears.** Predecessors are rewired to
 *    whatever the deleted node pointed at, and anything left unreachable is
 *    pruned — so a delete cannot leave the orphan steps the publish validator
 *    would then refuse.
 */
export default function WorkflowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({
  workflow,
  definition,
  onChange,
  onSwitchToTrigger,
  readOnly = false,
  theme = "light",
}: Props) {
  const domainNodes = useMemo(() => definition?.nodes ?? [], [definition]);
  const domainEdges = useMemo(() => definition?.edges ?? [], [definition]);

  const [editing, setEditing] = useState<WorkflowNode | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  /* ── lay out anything that arrived without a position ── */

  const laidNodes = useMemo(
    () => (needsLayout(domainNodes) ? autoLayout(domainNodes, domainEdges) : domainNodes),
    [domainNodes, domainEdges],
  );

  // Push the computed layout back exactly once per set of ids, so reopening
  // shows the same arrangement rather than re-deriving it every mount.
  const pushed = useRef<string | null>(null);

  useEffect(() => {
    const key = laidNodes.map((n) => n.id).join("|");
    if (pushed.current === key) return;

    pushed.current = key;

    // An empty workflow is seeded with its Exit here — `write` only runs on an
    // edit, and the whole point is that the ending is visible before the first
    // one. Also the moment a pre-canvas workflow gets its positions.
    const needsExit = !domainNodes.some((n) => n.type === "exit");

    if (needsLayout(domainNodes) || needsExit) {
      const guarded = ensureExitExists(laidNodes, domainEdges, newNodeId);

      onChange({
        nodes: guarded.nodes,
        edges: guarded.edges,
        entryNodeId: definition.entryNodeId ?? null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laidNodes]);

  const entryId = useMemo(
    () => resolveEntryId({ ...definition, nodes: laidNodes }),
    [definition, laidNodes],
  );

  /**
   * Every write goes through the Exit guarantee.
   *
   * The same place TPS puts it, and for the same reason: an automation ends,
   * and the ending belongs on the canvas from the start rather than appearing
   * only once somebody thinks to add one. It is idempotent — once an exit is
   * there this does nothing — so there is no loop back through `onChange`.
   */
  const write = useCallback(
    (nodes: WorkflowNode[], edges: WorkflowEdge[], entryNodeId: string | null) => {
      const guarded = ensureExitExists(nodes, edges, newNodeId);

      onChange({
        nodes: guarded.nodes,
        edges: guarded.edges,
        entryNodeId,
      });
    },
    [onChange],
  );

  const openConfig = useCallback(
    (id: string) => {
      const node = domainNodes.find((n) => n.id === id);
      // An exit has a label and nothing else worth a dialog on the canvas.
      if (!node) return;
      setEditing(node);
      setDialogOpen(true);
    },
    [domainNodes],
  );

  /* ── delete: bridge, then prune ── */

  const handleDelete = useCallback(
    (id: string) => {
      const deleted = domainNodes.find((n) => n.id === id);
      if (!deleted) return;

      /**
       * Where the predecessors should point instead.
       *
       * For a branch, the `yes` path is the one that continues — the `no`
       * subtree is usually a dead-end follow-up, and the reachability sweep
       * below removes it. For anything else, whatever it pointed at.
       */
      const bridgeTarget =
        deleted.type === "branch"
          ? domainEdges.find((e) => e.from === id && e.label === "yes")?.to
          : domainEdges.find((e) => e.from === id)?.to;

      const incoming = domainEdges.filter((e) => e.to === id);

      let nodes = domainNodes.filter((n) => n.id !== id);
      let edges = domainEdges.filter((e) => e.from !== id && e.to !== id);

      if (bridgeTarget) {
        for (const inc of incoming) {
          if (inc.from === bridgeTarget) continue;

          const exists = edges.some(
            (e) =>
              e.from === inc.from &&
              e.to === bridgeTarget &&
              (inc.label ? e.label === inc.label : !e.label),
          );

          if (!exists) {
            edges.push({
              from: inc.from,
              to: bridgeTarget,
              ...(inc.label ? { label: inc.label } : {}),
            });
          }
        }
      }

      /**
       * Prune whatever is now unreachable.
       *
       * Without this, deleting a branch leaves its `no` subtree floating — and
       * the publish validator refuses a workflow with steps "not connected to
       * the rest", so the admin would be looking at an error about steps they
       * never added.
       */
      const nextEntry =
        definition.entryNodeId === id ? null : (definition.entryNodeId ?? null);

      const stillEntry =
        (nextEntry && nodes.some((n) => n.id === nextEntry) ? nextEntry : null) ??
        nodes.find((n) => n.type !== "exit")?.id ??
        null;

      if (stillEntry) {
        const reachable = collectDescendants(stillEntry, edges, true);
        nodes = nodes.filter((n) => reachable.has(n.id));

        const surviving = new Set(nodes.map((n) => n.id));
        edges = edges.filter((e) => surviving.has(e.from) && surviving.has(e.to));
      }

      write(nodes, edges, stillEntry);
    },
    [domainNodes, domainEdges, definition.entryNodeId, write],
  );

  /* ── insert a step on an existing arrow ── */

  const insertOnEdge = useCallback(
    (
      sourceId: string | null,
      targetId: string,
      label: "yes" | "no" | undefined,
      type: WorkflowNodeType,
    ) => {
      if (readOnly) return;

      const sourcePos = sourceId
        ? domainNodes.find((n) => n.id === sourceId)?.position
        : undefined;
      const targetPos = domainNodes.find((n) => n.id === targetId)?.position;

      const x = sourcePos ? sourcePos.x : (targetPos?.x ?? 0);
      const y = sourcePos ? sourcePos.y + ROW : (targetPos?.y ?? 0);

      // Everything below the insertion point moves down a row, so the new step
      // lands in clean space rather than on top of what was already there.
      const downstream = collectDescendants(targetId, domainEdges, true);
      const shifted = domainNodes.map((n) =>
        downstream.has(n.id) && n.position
          ? { ...n, position: { x: n.position.x, y: n.position.y + ROW } }
          : n,
      );

      const created: WorkflowNode = {
        id: newNodeId(),
        type,
        config: defaultConfig(type) as NodeConfig,
        position: { x, y },
      };

      let nodes = [...shifted, created];
      let edges = [...domainEdges];
      let entryNodeId = definition.entryNodeId ?? null;

      if (sourceId) {
        // Drop the arrow we are inserting into, keeping its label so a branch
        // path stays a branch path.
        edges = edges.filter(
          (e) =>
            !(
              e.from === sourceId &&
              e.to === targetId &&
              (label ? e.label === label : !e.label)
            ),
        );

        edges.push({ from: sourceId, to: created.id, ...(label ? { label } : {}) });

        if (type !== "branch" && type !== "exit") {
          edges.push({ from: created.id, to: targetId });
        }
      } else {
        // Inserting on the trigger arrow: the new step becomes the entry and
        // forwards to whatever used to be first.
        entryNodeId = created.id;

        if (type !== "branch" && type !== "exit") {
          edges.push({ from: created.id, to: targetId });
        }
      }

      /**
       * A branch arrives wired on both sides, always.
       *
       * `yes` continues the flow that was already there; `no` gets an exit of
       * its own. The publish validator requires both edges, so an if/then that
       * appeared with one would be born invalid — and the person who added it
       * would have to work out what was missing from an error message.
       */
      if (type === "branch") {
        const noExit: WorkflowNode = {
          id: newNodeId(),
          type: "exit",
          config: { reason: "completed" },
          position: { x: x + 340, y: y + ROW },
        };

        nodes = [...nodes, noExit];
        edges.push({ from: created.id, to: targetId, label: "yes" });
        edges.push({ from: created.id, to: noExit.id, label: "no" });
      }

      write(nodes, edges, entryNodeId);

      // Straight into its config — a step you just added is a step you are
      // about to fill in. An exit has nothing worth opening for.
      if (type !== "exit") {
        setTimeout(() => {
          setEditing(created);
          setDialogOpen(true);
        }, 0);
      }
    },
    [domainNodes, domainEdges, definition.entryNodeId, readOnly, write],
  );

  /* ── React Flow nodes ── */

  const builtNodes = useMemo<RFNode[]>(() => {
    const entry = laidNodes.find((n) => n.id === entryId);

    const triggerData: TriggerNodeData = {
      title: workflow.triggerType ? describeTrigger(workflow) : "Trigger not set",
      subtitle: workflow.triggerType
        ? workflow.triggerType === "newActivity"
          ? "Enrols people automatically as they arrive."
          : "Enrols a list when you press Run."
        : "Click to choose how people enter this automation.",
      configured: Boolean(workflow.triggerType),
      onClick: onSwitchToTrigger,
      readOnly,
    };

    const trigger: RFNode = {
      id: TRIGGER_RF_ID,
      type: "trigger",
      position: {
        x: entry?.position ? entry.position.x : 0,
        y: entry?.position ? entry.position.y - 200 : -200,
      },
      draggable: false,
      selectable: false,
      data: triggerData as unknown as Record<string, unknown>,
    };

    const incoming = new Set(domainEdges.map((e) => e.to));
    // The trigger arrow is synthesised, so the entry node has no stored
    // incoming edge — but it is wired, and its delete button should say so.
    if (entryId) incoming.add(entryId);

    const steps: RFNode[] = laidNodes.map((node) => {
      const data: CanvasNodeData = {
        workflowNode: node,
        readOnly,
        isIncomplete: isStepIncomplete(node),
        onClick: openConfig,
        onDelete: handleDelete,
        hasIncoming: incoming.has(node.id),
      };

      return {
        id: node.id,
        type: node.type === "branch" ? "branch" : "step",
        position: node.position || { x: 0, y: 0 },
        draggable: !readOnly,
        data: data as unknown as Record<string, unknown>,
      };
    });

    return [trigger, ...steps];
  }, [
    workflow,
    laidNodes,
    entryId,
    domainEdges,
    readOnly,
    openConfig,
    handleDelete,
    onSwitchToTrigger,
  ]);

  /* ── React Flow edges ── */

  const builtEdges = useMemo<RFEdge[]>(() => {
    const out: RFEdge[] = [];

    if (entryId) {
      const data: InsertableEdgeData = {
        readOnly,
        variant: "trigger",
        onInsert: (type) => insertOnEdge(null, entryId, undefined, type),
      };

      out.push({
        id: `${TRIGGER_RF_ID}-to-${entryId}`,
        source: TRIGGER_RF_ID,
        target: entryId,
        type: "insertable",
        deletable: false,
        selectable: false,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: VARIANT_STROKE.trigger,
          width: 16,
          height: 16,
        },
        data: data as unknown as Record<string, unknown>,
      });
    }

    for (const edge of domainEdges) {
      const isYes = edge.label === "yes";
      const isNo = edge.label === "no";
      const stroke = isYes
        ? VARIANT_STROKE.yes
        : isNo
          ? VARIANT_STROKE.no
          : VARIANT_STROKE.default;

      const data: InsertableEdgeData = {
        readOnly,
        variant: isYes ? "yes" : isNo ? "no" : "default",
        onInsert: (type) => insertOnEdge(edge.from, edge.to, edge.label, type),
      };

      out.push({
        id: `${edge.from}-${edge.label || "-"}->${edge.to}`,
        source: edge.from,
        target: edge.to,
        sourceHandle: edge.label || undefined,
        type: "insertable",
        label: isYes ? "Yes" : isNo ? "No" : undefined,
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
        labelBgStyle: isYes
          ? { fill: "#ecfdf5", stroke: "#bbf7d0" }
          : isNo
            ? { fill: "#fff1f2", stroke: "#fecaca" }
            : undefined,
        labelStyle: isYes
          ? { fill: "#047857", fontWeight: 600, fontSize: 11 }
          : isNo
            ? { fill: "#be123c", fontWeight: 600, fontSize: 11 }
            : undefined,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: stroke,
          width: 16,
          height: 16,
        },
        data: data as unknown as Record<string, unknown>,
      });
    }

    return out;
  }, [entryId, domainEdges, readOnly, insertOnEdge]);

  const [rfNodes, setRfNodes] = useNodesState(builtNodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(builtEdges);

  useEffect(() => setRfNodes(builtNodes), [builtNodes, setRfNodes]);
  useEffect(() => setRfEdges(builtEdges), [builtEdges, setRfEdges]);

  /* ── dragging persists position ── */

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setRfNodes((cur) => applyNodeChanges(changes, cur));

      if (readOnly) return;

      // Only a finished drag is written back. React Flow also reports selection
      // and dimension changes, and folding those in would make clicking a step
      // an edit — which, with autosave upstream, means a request.
      const stops = changes.filter(
        (c): c is NodeChange & { type: "position"; id: string; position?: { x: number; y: number } } =>
          c.type === "position" && "dragging" in c && c.dragging === false,
      );

      if (!stops.length) return;

      const moved = new Map(stops.map((c) => [c.id, c.position]));

      write(
        domainNodes.map((n) => {
          const position = moved.get(n.id);
          return position ? { ...n, position: { x: position.x, y: position.y } } : n;
        }),
        domainEdges,
        definition.entryNodeId ?? null,
      );
    },
    [domainNodes, domainEdges, definition.entryNodeId, readOnly, setRfNodes, write],
  );

  /* ── rewiring by dragging a handle ── */

  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (readOnly || !connection.source || !connection.target) return;
      if (connection.target === TRIGGER_RF_ID) return;
      if (connection.source === connection.target) return;

      // Dragging from the trigger repoints the entry rather than adding an edge.
      if (connection.source === TRIGGER_RF_ID) {
        if (!domainNodes.some((n) => n.id === connection.target)) return;
        write(domainNodes, domainEdges, connection.target);
        return;
      }

      const from = domainNodes.find((n) => n.id === connection.source);
      const isBranch = from?.type === "branch";

      // One edge per source handle. A branch keeps its other path; anything
      // else replaces its single outgoing arrow rather than gaining a second
      // one, which would leave the person two places to go.
      const kept = domainEdges.filter((e) => {
        if (e.from !== connection.source) return true;
        return isBranch ? e.label !== connection.sourceHandle : false;
      });

      const edge: WorkflowEdge = { from: connection.source, to: connection.target };
      if (isBranch && connection.sourceHandle) {
        edge.label = connection.sourceHandle as "yes" | "no";
      }

      write(domainNodes, [...kept, edge], definition.entryNodeId ?? null);
    },
    [domainNodes, domainEdges, definition.entryNodeId, readOnly, write],
  );

  const handleEdgesDelete = useCallback(
    (removed: RFEdge[]) => {
      if (readOnly) return;

      write(
        domainNodes,
        domainEdges.filter((e) => {
          for (const r of removed) {
            // The trigger arrow is synthesised and cannot be deleted.
            if (r.source === TRIGGER_RF_ID) continue;
            if (e.from !== r.source || e.to !== r.target) continue;
            if (r.sourceHandle && e.label !== r.sourceHandle) continue;
            return false;
          }
          return true;
        }),
        definition.entryNodeId ?? null,
      );
    },
    [domainNodes, domainEdges, definition.entryNodeId, readOnly, write],
  );

  const saveConfig = (config: NodeConfig) => {
    if (!editing) return;

    write(
      domainNodes.map((n) => (n.id === editing.id ? { ...n, config } : n)),
      domainEdges,
      definition.entryNodeId ?? null,
    );
  };

  const isDark = theme === "dark";

  return (
    <>
      <div
        className={`h-180 rounded-md border overflow-hidden bg-white dark:bg-zinc-900 dark:border-zinc-700 ${
          isDark ? "dark" : ""
        }`}
      >
        {/* Scoped to `.dark` inside this wrapper, so flipping the canvas never
            touches the rest of the panel. */}
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
          <Background gap={20} size={1} color={isDark ? "#3f3f46" : "#e5e7eb"} />
          <MiniMap pannable zoomable className="bg-zinc-50! dark:bg-zinc-800!" />
          <Controls showInteractive={false} className="shadow-none! border!" />
        </ReactFlow>
      </div>

      <StepConfigSheet
        workflowId={workflow.id}
        node={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={saveConfig}
        readOnly={readOnly}
      />
    </>
  );
}

const DEFAULT_EDGE = {
  type: "insertable",
  animated: false,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: VARIANT_STROKE.default,
    width: 16,
    height: 16,
  } as EdgeMarker,
};

/**
 * React Flow's own chrome does not read Tailwind tokens, so the controls, the
 * minimap and the edge labels need overriding by hand for the dark variant.
 * Every rule is prefixed `.dark`, which only ever exists on the canvas wrapper.
 */
const CANVAS_DARK_CSS = `
.dark .react-flow { background: rgb(24 24 27); }
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
.dark .react-flow__controls-button:hover { background: rgb(63 63 70); }
.dark .react-flow__minimap-mask { fill: rgba(24, 24, 27, 0.7); }
.dark .react-flow__edge-text { fill: rgb(228 228 231); }
.dark .react-flow__edge-textbg { fill: rgb(39 39 42); }
.dark .react-flow__handle {
  background: rgb(39 39 42);
  border-color: rgb(113 113 122);
}
`;

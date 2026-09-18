"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Mail,
  Clock,
  GitBranch,
  Zap,
  Trash2,
  AlertCircle,
  LogOut,
} from "lucide-react";

import type {
  ConditionConfig,
  DelayConfig,
  GoalConfig,
  NodeType,
  SendEmailConfig,
  WorkflowNode,
} from "@/types/workflow";
import AddStepMenu from "./AddStepMenu";

// Data carried on each xyflow node — keeps a back-reference to the underlying
// workflow node + UI callbacks the custom card needs. The callbacks already
// know which node id they belong to via closure capture in the canvas parent.
export type CanvasNodeData = {
  workflowNode: WorkflowNode;
  isIncomplete?: boolean;
  readOnly: boolean;
  onClick: (id: string) => void;
  onDelete: (id: string) => void;
  onAddStep: (type: NodeType, branch?: "match" | "no_match") => void;
  hasOutgoing?: boolean;
  hasMatchOutgoing?: boolean;
  hasNoMatchOutgoing?: boolean;
  // True when at least one edge points at this node. Exit cards expose a
  // delete button only when this is false (so a disconnected Exit can be
  // removed; a wired-up Exit stays put).
  hasIncoming?: boolean;
};

const NODE_ICONS: Record<NodeType, React.ComponentType<any>> = {
  "action.send_email": Mail,
  "action.send_whatsapp": Mail,
  "control.delay": Clock,
  "control.condition": GitBranch,
  "control.ab_split": GitBranch,
  "control.goal": LogOut,
};

const NODE_THEME: Record<NodeType, { iconBg: string; border: string; tint: string }> = {
  "action.send_email": {
    iconBg: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    border:
      "border-sky-200 hover:border-sky-400 dark:border-sky-800 dark:hover:border-sky-500",
    tint: "bg-white dark:bg-zinc-800",
  },
  "action.send_whatsapp": {
    iconBg:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    border:
      "border-emerald-200 hover:border-emerald-400 dark:border-emerald-800 dark:hover:border-emerald-500",
    tint: "bg-white dark:bg-zinc-800",
  },
  "control.delay": {
    iconBg: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    border:
      "border-amber-200 hover:border-amber-400 dark:border-amber-800 dark:hover:border-amber-500",
    tint: "bg-white dark:bg-zinc-800",
  },
  "control.condition": {
    iconBg:
      "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
    border:
      "border-violet-200 hover:border-violet-400 dark:border-violet-800 dark:hover:border-violet-500",
    tint: "bg-white dark:bg-zinc-800",
  },
  "control.ab_split": {
    iconBg:
      "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300",
    border:
      "border-fuchsia-200 hover:border-fuchsia-400 dark:border-fuchsia-800 dark:hover:border-fuchsia-500",
    tint: "bg-white dark:bg-zinc-800",
  },
  "control.goal": {
    iconBg:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    border: "border-emerald-300 dark:border-emerald-700",
    tint: "bg-emerald-50/60 dark:bg-emerald-950/40",
  },
};

const handleStyle = {
  width: 10,
  height: 10,
  background: "#fff",
  border: "2px solid #94a3b8",
};

// ──────────────────────────────────────────────────────────────────────────
// TriggerNode — click jumps to Trigger tab. Has an outgoing handle + inline
// "+" button when nothing's connected yet.
// ──────────────────────────────────────────────────────────────────────────

export type TriggerNodeData = {
  title: string;
  subtitle: string;
  configured: boolean;
  onClick: () => void;
  readOnly: boolean;
  hasOutgoing: boolean;
  onAddStep: (type: NodeType) => void;
};

export const TriggerNode = memo(function TriggerNode({
  data,
}: NodeProps) {
  const d = data as unknown as TriggerNodeData;
  return (
    <div className="relative">
      <div
        onClick={(e) => {
          e.stopPropagation();
          d.onClick();
        }}
        className={`w-[280px] rounded-lg border-2 border-dashed ${
          d.configured
            ? "border-primary/40 hover:border-primary"
            : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-600 dark:hover:border-zinc-400"
        } bg-white dark:bg-zinc-800 px-4 py-3 cursor-pointer hover:shadow-sm transition`}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg shrink-0 bg-primary/10 text-primary">
            <Zap className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                Trigger
              </span>
              {!d.configured && (
                <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300">
                  Not set
                </span>
              )}
            </div>
            <div className="text-sm font-medium truncate text-foreground">
              {d.title}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {d.subtitle}
            </div>
          </div>
        </div>
        <Handle type="source" position={Position.Bottom} style={handleStyle} />
      </div>

      {!d.readOnly && !d.hasOutgoing && (
        <div className="flex justify-center mt-3">
          <AddStepMenu
            onPick={(type) => d.onAddStep(type)}
            label="Add first step"
            exclude={["control.goal"]}
          />
        </div>
      )}
    </div>
  );
});

// ──────────────────────────────────────────────────────────────────────────
// StepNode — used for send_email, delay, exit. One input (top), one output
// (bottom) — exit has no output. Inline "+" appears below the source handle
// when there's no outgoing edge yet.
// ──────────────────────────────────────────────────────────────────────────

export const StepNode = memo(function StepNode({ data, selected }: NodeProps) {
  const d = data as unknown as CanvasNodeData;
  const node = d.workflowNode;
  const isExit = node.type === "control.goal";
  const theme = NODE_THEME[node.type] || NODE_THEME["action.send_email"];
  const Icon = NODE_ICONS[node.type] || Mail;
  const title = stepTitle(node);
  const summary = stepSummary(node);

  return (
    <div className="relative">
      <div
        onClick={(e) => {
          e.stopPropagation();
          d.onClick(node.id);
        }}
        className={`w-[280px] rounded-lg border-2 ${theme.border} ${theme.tint} px-4 py-3 transition cursor-pointer hover:shadow-sm ${
          selected ? "ring-2 ring-primary ring-offset-1" : ""
        }`}
      >
        <Handle type="target" position={Position.Top} style={handleStyle} />

        <div className="flex items-start gap-3">
          <div
            className={`flex items-center justify-center h-10 w-10 rounded-lg shrink-0 ${theme.iconBg}`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-foreground">
                {title}
              </span>
              {d.isIncomplete && (
                <span className="inline-flex items-center text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300">
                  <AlertCircle className="h-3 w-3 mr-0.5" />
                  Incomplete
                </span>
              )}
            </div>
            {summary && (
              <div className="text-xs text-muted-foreground truncate mt-0.5">
                {summary}
              </div>
            )}
          </div>
          {!d.readOnly && (!isExit || !d.hasIncoming) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                d.onDelete(node.id);
              }}
              className="nodrag text-muted-foreground hover:text-destructive shrink-0"
              aria-label={isExit ? "Remove disconnected Exit" : "Delete step"}
              title={isExit ? "Remove this disconnected Exit" : "Delete step"}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {!isExit && (
          <Handle type="source" position={Position.Bottom} style={handleStyle} />
        )}
      </div>

      {!d.readOnly && !isExit && !d.hasOutgoing && (
        <div className="flex justify-center mt-3">
          <AddStepMenu onPick={(type) => d.onAddStep(type)} />
        </div>
      )}
    </div>
  );
});

// ──────────────────────────────────────────────────────────────────────────
// ConditionNode — TWO output handles (yes / no). Each handle gets its own
// "+" button when nothing's connected.
// ──────────────────────────────────────────────────────────────────────────

export const ConditionNode = memo(function ConditionNode({
  data,
  selected,
}: NodeProps) {
  const d = data as unknown as CanvasNodeData;
  const node = d.workflowNode;
  const theme = NODE_THEME["control.condition"];
  const summary = stepSummary(node);

  return (
    <div className="relative">
      <div
        onClick={(e) => {
          e.stopPropagation();
          d.onClick(node.id);
        }}
        className={`w-[280px] rounded-lg border-2 ${theme.border} ${theme.tint} px-4 py-3 cursor-pointer hover:shadow-sm transition ${
          selected ? "ring-2 ring-primary ring-offset-1" : ""
        }`}
      >
        <Handle type="target" position={Position.Top} style={handleStyle} />

        <div className="flex items-start gap-3">
          <div
            className={`flex items-center justify-center h-10 w-10 rounded-lg shrink-0 ${theme.iconBg}`}
          >
            <GitBranch className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-foreground">
                If / then
              </span>
              {d.isIncomplete && (
                <span className="inline-flex items-center text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300">
                  <AlertCircle className="h-3 w-3 mr-0.5" />
                  Incomplete
                </span>
              )}
            </div>
            {summary && (
              <div className="text-xs text-muted-foreground truncate mt-0.5">
                {summary}
              </div>
            )}
          </div>
          {!d.readOnly && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                d.onDelete(node.id);
              }}
              className="nodrag text-muted-foreground hover:text-destructive shrink-0"
              aria-label="Delete step"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Branch labels above each handle */}
        <div className="absolute -bottom-1 left-0 right-0 flex justify-between px-6 pointer-events-none">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-white border border-emerald-200 rounded-full px-1.5 py-0.5 dark:text-emerald-300 dark:bg-zinc-800 dark:border-emerald-800">
            ✓ Yes
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-rose-700 bg-white border border-rose-200 rounded-full px-1.5 py-0.5 dark:text-rose-300 dark:bg-zinc-800 dark:border-rose-800">
            ✗ No
          </span>
        </div>

        <Handle
          id="match"
          type="source"
          position={Position.Bottom}
          style={{
            ...handleStyle,
            background: "#10b981",
            borderColor: "#059669",
            left: "25%",
          }}
        />
        <Handle
          id="no_match"
          type="source"
          position={Position.Bottom}
          style={{
            ...handleStyle,
            background: "#f43f5e",
            borderColor: "#e11d48",
            left: "75%",
          }}
        />
      </div>

      {!d.readOnly && (
        <div className="flex justify-between px-4 mt-3">
          <div className="w-1/2 flex justify-center">
            {!d.hasMatchOutgoing && (
              <AddStepMenu
                onPick={(type) => d.onAddStep(type, "match")}
                label="Add on Yes"
              />
            )}
          </div>
          <div className="w-1/2 flex justify-center">
            {!d.hasNoMatchOutgoing && (
              <AddStepMenu
                onPick={(type) => d.onAddStep(type, "no_match")}
                label="Add on No"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
});

// ──────────────────────────────────────────────────────────────────────────
// Summary helpers
// ──────────────────────────────────────────────────────────────────────────

function stepTitle(node: WorkflowNode): string {
  switch (node.type) {
    case "action.send_email": return "Send email";
    case "action.send_whatsapp": return "Send WhatsApp";
    case "control.delay": return "Wait";
    case "control.goal": return "Exit";
    case "control.condition": return "If / then";
    case "control.ab_split": return "A/B split";
    default: return node.id;
  }
}

function stepSummary(node: WorkflowNode): string | null {
  const c: any = node.config || {};
  switch (node.type) {
    case "action.send_email": {
      const cfg = c as SendEmailConfig;
      return cfg.subject || "(no subject)";
    }
    case "control.delay": {
      const cfg = c as DelayConfig;
      return cfg.duration_value
        ? `${cfg.duration_value} ${cfg.duration_unit}`
        : null;
    }
    case "control.goal": {
      const cfg = c as GoalConfig;
      return cfg.goal_name && cfg.goal_name !== "completed" ? cfg.goal_name : "End of workflow";
    }
    case "control.condition":
      return summarizeCondition(c as ConditionConfig);
    default:
      return null;
  }
}

function summarizeCondition(c: ConditionConfig): string {
  if (!c?.event_type) return "Configure condition";
  const what = prettyEvent(c.event_type);
  if (c.timeout_value && c.timeout_unit) {
    return `Wait up to ${c.timeout_value} ${c.timeout_unit} for ${what}`;
  }
  return `Wait for ${what}`;
}

function prettyEvent(t: string): string {
  switch (t) {
    case "email.opened": return "opened email";
    case "email.clicked": return "clicked link";
    case "email.unsubscribed": return "unsubscribed";
    default: return t || "event";
  }
}

export const NODE_TYPES_FOR_CANVAS = {
  trigger: TriggerNode,
  step: StepNode,
  condition: ConditionNode,
} as const;

"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  AlertCircle,
  Clock,
  GitBranch,
  LogOut,
  Mail,
  Trash2,
  Zap,
} from "lucide-react";

import type {
  BranchConfig,
  SendEmailConfig,
  WaitConfig,
  WorkflowNode,
  WorkflowNodeType,
} from "@/gradient/types/workflow";
import { CONDITION_QUESTIONS } from "../stepHelpers";

/**
 * The cards on the canvas.
 *
 * Deliberately the same shapes TPS uses — a 280px card, a tinted icon tile, a
 * one-line summary, an amber "Incomplete" pill, and a branch card with two
 * coloured handles under labelled Yes/No pills. Matching it means anybody who
 * has used the TPS panel already knows this one.
 *
 * Every colour is declared in both light and dark, because the canvas carries
 * its own theme toggle and the rest of the admin does not follow it.
 */

export type CanvasNodeData = {
  workflowNode: WorkflowNode;
  isIncomplete?: boolean;
  readOnly: boolean;
  onClick: (id: string) => void;
  onDelete: (id: string) => void;
  /** True when at least one edge points at this node. An exit only offers a
   *  delete button when nothing points at it, so a wired-up ending stays put. */
  hasIncoming?: boolean;
};

const NODE_ICONS: Record<WorkflowNodeType, typeof Mail> = {
  sendEmail: Mail,
  wait: Clock,
  branch: GitBranch,
  exit: LogOut,
};

const NODE_THEME: Record<
  WorkflowNodeType,
  { iconBg: string; border: string; tint: string }
> = {
  sendEmail: {
    iconBg: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    border:
      "border-sky-200 hover:border-sky-400 dark:border-sky-800 dark:hover:border-sky-500",
    tint: "bg-white dark:bg-zinc-800",
  },
  wait: {
    iconBg: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    border:
      "border-amber-200 hover:border-amber-400 dark:border-amber-800 dark:hover:border-amber-500",
    tint: "bg-white dark:bg-zinc-800",
  },
  branch: {
    iconBg:
      "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
    border:
      "border-violet-200 hover:border-violet-400 dark:border-violet-800 dark:hover:border-violet-500",
    tint: "bg-white dark:bg-zinc-800",
  },
  exit: {
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

const INCOMPLETE_PILL =
  "inline-flex items-center text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300";

/* ── trigger ─────────────────────────────────────────────────────────────── */

export type TriggerNodeData = {
  title: string;
  subtitle: string;
  configured: boolean;
  onClick: () => void;
  readOnly: boolean;
};

/**
 * The first thing on the canvas, always.
 *
 * It is not a step and is not stored in the definition — it is the trigger
 * drawn as a node, so the canvas reads the way the journey actually runs:
 * somebody enters, *then* things happen to them. Dashed, because it is a
 * different kind of thing from a step, and clicking it jumps to the Trigger
 * tab rather than opening a config dialog.
 */
export const TriggerNode = memo(function TriggerNode({ data }: NodeProps) {
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
                <span className={INCOMPLETE_PILL}>Not set</span>
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
    </div>
  );
});

/* ── a plain step ────────────────────────────────────────────────────────── */

export const StepNode = memo(function StepNode({ data, selected }: NodeProps) {
  const d = data as unknown as CanvasNodeData;
  const node = d.workflowNode;
  const isExit = node.type === "exit";
  const theme = NODE_THEME[node.type] ?? NODE_THEME.sendEmail;
  const Icon = NODE_ICONS[node.type] ?? Mail;

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
                {stepTitle(node)}
              </span>
              {d.isIncomplete && (
                <span className={INCOMPLETE_PILL}>
                  <AlertCircle className="h-3 w-3 mr-0.5" />
                  Incomplete
                </span>
              )}
            </div>
            {stepSummary(node) && (
              <div className="text-xs text-muted-foreground truncate mt-0.5">
                {stepSummary(node)}
              </div>
            )}
          </div>

          {/* An exit that something points at stays put — deleting it would
              strand whatever led into it. A disconnected one can go. */}
          {!d.readOnly && (!isExit || !d.hasIncoming) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                d.onDelete(node.id);
              }}
              className="nodrag text-muted-foreground hover:text-destructive shrink-0"
              aria-label={isExit ? "Remove disconnected exit" : "Delete step"}
              title={isExit ? "Remove this disconnected exit" : "Delete step"}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {!isExit && (
          <Handle type="source" position={Position.Bottom} style={handleStyle} />
        )}
      </div>
    </div>
  );
});

/* ── the if/then ─────────────────────────────────────────────────────────── */

export const BranchNode = memo(function BranchNode({
  data,
  selected,
}: NodeProps) {
  const d = data as unknown as CanvasNodeData;
  const node = d.workflowNode;
  const theme = NODE_THEME.branch;

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
                <span className={INCOMPLETE_PILL}>
                  <AlertCircle className="h-3 w-3 mr-0.5" />
                  Incomplete
                </span>
              )}
            </div>
            {stepSummary(node) && (
              <div className="text-xs text-muted-foreground truncate mt-0.5">
                {stepSummary(node)}
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

        {/* Which handle is which, said on the card. Two identical dots under a
            branch is a coin toss for whoever is wiring it. */}
        <div className="absolute -bottom-1 left-0 right-0 flex justify-between px-6 pointer-events-none">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-white border border-emerald-200 rounded-full px-1.5 py-0.5 dark:text-emerald-300 dark:bg-zinc-800 dark:border-emerald-800">
            ✓ Yes
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-rose-700 bg-white border border-rose-200 rounded-full px-1.5 py-0.5 dark:text-rose-300 dark:bg-zinc-800 dark:border-rose-800">
            ✗ No
          </span>
        </div>

        <Handle
          id="yes"
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
          id="no"
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
    </div>
  );
});

/* ── card wording ────────────────────────────────────────────────────────── */

function stepTitle(node: WorkflowNode): string {
  switch (node.type) {
    case "sendEmail":
      return "Send email";
    case "wait":
      return "Wait";
    case "branch":
      return "If / then";
    case "exit":
      return "Exit";
    default:
      return node.id;
  }
}

function stepSummary(node: WorkflowNode): string | null {
  const config = (node.config ?? {}) as Record<string, unknown>;

  switch (node.type) {
    case "sendEmail":
      return (config as unknown as SendEmailConfig).subject || "(no subject)";

    case "wait": {
      const wait = config as unknown as WaitConfig;
      return wait.value ? `${wait.value} ${wait.unit}` : null;
    }

    case "exit": {
      const reason = config.reason as string | undefined;
      return reason && reason !== "completed" ? reason : "End of workflow";
    }

    case "branch": {
      const branch = config as unknown as BranchConfig;
      if (!branch.eventType) return "Configure this step";

      const what = CONDITION_QUESTIONS[branch.eventType] ?? branch.eventType;

      return branch.timeoutValue && branch.timeoutUnit
        ? `Wait up to ${branch.timeoutValue} ${branch.timeoutUnit} — ${what.toLowerCase()}?`
        : `${what}?`;
    }

    default:
      return null;
  }
}

export const NODE_TYPES_FOR_CANVAS = {
  trigger: TriggerNode,
  step: StepNode,
  branch: BranchNode,
} as const;

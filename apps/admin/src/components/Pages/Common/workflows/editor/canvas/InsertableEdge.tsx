"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
  MarkerType,
} from "@xyflow/react";
import { Mail, Clock, GitBranch, Plus, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NodeType } from "@/types/workflow";

// Data injected per-edge by WorkflowCanvas. The "+" button calls onInsert
// with the picked NodeType.
export type InsertableEdgeData = {
  onInsert: (type: NodeType) => void;
  readOnly: boolean;
  variant?: "default" | "match" | "no_match" | "trigger";
};

const VARIANT_STROKE: Record<NonNullable<InsertableEdgeData["variant"]>, string> = {
  default: "#64748b",
  match: "#10b981",
  no_match: "#f43f5e",
  trigger: "#7c3aed",
};

const ITEMS: Array<{ type: NodeType; label: string; Icon: React.ComponentType<any>; tint: string }> = [
  { type: "action.send_email", label: "Send email", Icon: Mail, tint: "text-sky-600" },
  { type: "control.delay", label: "Wait", Icon: Clock, tint: "text-amber-600" },
  { type: "control.condition", label: "If / then", Icon: GitBranch, tint: "text-violet-600" },
  { type: "control.goal", label: "Exit", Icon: LogOut, tint: "text-emerald-600" },
];

export const InsertableEdge = memo(function InsertableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
}: EdgeProps) {
  const d = (data || {}) as unknown as InsertableEdgeData;
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const stroke = VARIANT_STROKE[d.variant || "default"];
  const isTrigger = d.variant === "trigger";

  const computedStyle: React.CSSProperties = {
    stroke,
    strokeWidth: 2,
    ...(isTrigger ? { strokeDasharray: "6 4" } : {}),
    ...(style || {}),
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={computedStyle}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
            zIndex: 1000,
          }}
          className="nodrag nopan"
        >
          {!d.readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  title="Add step here"
                  style={{
                    background: stroke,
                    borderColor: "white",
                  }}
                  className="flex items-center justify-center h-7 w-7 rounded-full text-white border-2 shadow-md hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                >
                  <Plus className="h-4 w-4" strokeWidth={3} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="center"
                side="bottom"
                onClick={(e) => e.stopPropagation()}
                className="min-w-[180px]"
              >
                {ITEMS.map((item) => (
                  <DropdownMenuItem
                    key={item.type}
                    onClick={(e) => {
                      e.stopPropagation();
                      d.onInsert(item.type);
                    }}
                  >
                    <item.Icon className={`h-4 w-4 mr-2 ${item.tint}`} />
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

export const INSERTABLE_EDGE_MARKER = {
  type: MarkerType.ArrowClosed,
  width: 16,
  height: 16,
};

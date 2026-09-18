"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { Clock, GitBranch, LogOut, Mail, Plus } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/gradient/components/ui/dropdown-menu";
import type { WorkflowNodeType } from "@/gradient/types/workflow";

/**
 * Every connection carries a "+" in the middle.
 *
 * This is how a step gets added, and it is a better idea than a toolbar button:
 * the question is never "add a step" in the abstract, it is "add a step
 * **here**". Dropping a node into a corner and then wiring it up is two
 * problems; clicking the arrow between two steps is none.
 *
 * The colour of the button is the colour of the edge, so the yes and no paths
 * out of a branch stay distinguishable right down to the control you press.
 */

export type InsertableEdgeData = {
  onInsert: (type: WorkflowNodeType) => void;
  readOnly: boolean;
  variant?: "default" | "yes" | "no" | "trigger";
};

export const VARIANT_STROKE: Record<
  NonNullable<InsertableEdgeData["variant"]>,
  string
> = {
  default: "#64748b",
  yes: "#10b981",
  no: "#f43f5e",
  trigger: "#7c3aed",
};

const ITEMS: {
  type: WorkflowNodeType;
  label: string;
  Icon: typeof Mail;
  tint: string;
}[] = [
  { type: "sendEmail", label: "Send email", Icon: Mail, tint: "text-sky-600" },
  { type: "wait", label: "Wait", Icon: Clock, tint: "text-amber-600" },
  { type: "branch", label: "If / then", Icon: GitBranch, tint: "text-violet-600" },
  { type: "exit", label: "Exit", Icon: LogOut, tint: "text-emerald-600" },
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

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke,
          strokeWidth: 2,
          // Dashed from the trigger, because that connection is synthesised
          // rather than stored — it cannot be deleted or rewired like the rest.
          ...(isTrigger ? { strokeDasharray: "6 4" } : {}),
          ...(style || {}),
        }}
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
                  title="Add a step here"
                  style={{ background: stroke, borderColor: "white" }}
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

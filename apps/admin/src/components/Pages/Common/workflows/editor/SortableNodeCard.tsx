"use client";

import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  GripVertical,
  Mail,
  Clock,
  Target,
  Trash2,
  AlertCircle,
  Flag,
  GitBranch,
} from "lucide-react";
import type { WorkflowNode, NodeType } from "@/types/workflow";
import { nodeLabel } from "./utils";

type Props = {
  node: WorkflowNode;
  onClick: () => void;
  onDelete: () => void;
  readOnly: boolean;
  isIncomplete?: boolean;
};

const NODE_ICONS: Record<NodeType, React.ComponentType<any>> = {
  "action.send_email": Mail,
  "action.send_whatsapp": Mail,
  "control.delay": Clock,
  "control.condition": GitBranch,
  "control.ab_split": Target,
  "control.goal": Flag,
};

// Tailwind classes per node type — icon bg + accent border.
const NODE_THEME: Record<NodeType, { iconBg: string; ring: string }> = {
  "action.send_email": {
    iconBg: "bg-sky-100 text-sky-700",
    ring: "hover:border-sky-300",
  },
  "action.send_whatsapp": {
    iconBg: "bg-emerald-100 text-emerald-700",
    ring: "hover:border-emerald-300",
  },
  "control.delay": {
    iconBg: "bg-amber-100 text-amber-700",
    ring: "hover:border-amber-300",
  },
  "control.condition": {
    iconBg: "bg-violet-100 text-violet-700",
    ring: "hover:border-violet-300",
  },
  "control.ab_split": {
    iconBg: "bg-fuchsia-100 text-fuchsia-700",
    ring: "hover:border-fuchsia-300",
  },
  "control.goal": {
    iconBg: "bg-emerald-100 text-emerald-700",
    ring: "border-emerald-300",
  },
};

export default function SortableNodeCard({
  node,
  onClick,
  onDelete,
  readOnly,
  isIncomplete,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id, disabled: readOnly });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = NODE_ICONS[node.type] || Target;
  const theme = NODE_THEME[node.type] || NODE_THEME["action.send_email"];
  const isGoal = node.type === "control.goal";

  const summary = renderSummary(node);

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`
        flex items-center gap-4 p-4 transition-all
        border-2 ${theme.ring}
        ${isGoal ? "cursor-default bg-emerald-50/40" : "cursor-pointer bg-white"}
        ${isDragging ? "ring-2 ring-primary shadow-lg" : isGoal ? "" : "hover:shadow-md"}
      `}
      onClick={isGoal ? undefined : onClick}
    >
      {!readOnly && (
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab text-muted-foreground hover:text-foreground shrink-0"
          aria-label="Drag handle"
        >
          <GripVertical className="h-5 w-5" />
        </button>
      )}

      <div
        className={`flex items-center justify-center h-12 w-12 rounded-lg shrink-0 ${theme.iconBg}`}
      >
        <Icon className="h-6 w-6" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-base">{nodeLabel(node.type)}</span>
          {isIncomplete && (
            <Badge
              variant="outline"
              className="bg-amber-100 text-amber-800 border-amber-200 text-xs"
            >
              <AlertCircle className="h-3 w-3 mr-1" />
              incomplete
            </Badge>
          )}
        </div>
        {summary && (
          <div className="text-sm text-muted-foreground truncate mt-0.5">
            {summary}
          </div>
        )}
      </div>

      {!readOnly && !isGoal && (
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="shrink-0"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      )}
    </Card>
  );
}

function renderSummary(node: WorkflowNode): string | null {
  const c: any = node.config || {};
  switch (node.type) {
    case "action.send_email":
      return c.subject || "(no subject)";
    case "control.delay":
      return c.duration_value
        ? `Wait ${c.duration_value} ${c.duration_unit}`
        : null;
    case "control.goal":
      return c.goal_name ? `Goal: ${c.goal_name}` : null;
    case "control.condition":
      return summarizeCondition(c);
    default:
      return null;
  }
}

function summarizeCondition(c: any): string {
  if (!c?.event_type) return "Configure condition";
  const what = c.event_type;
  if (c.timeout_value && c.timeout_unit) {
    return `If ${what} within ${c.timeout_value} ${c.timeout_unit} → Yes, else No`;
  }
  return `If ${what} → Yes, else No`;
}

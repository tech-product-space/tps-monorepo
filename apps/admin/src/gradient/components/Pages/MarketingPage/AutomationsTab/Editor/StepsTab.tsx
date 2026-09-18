"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Clock,
  LogOut,
  Mail,
  Plus,
  Trash2,
} from "lucide-react";

import { Button } from "@/gradient/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/gradient/components/ui/dropdown-menu";

import type {
  NodeConfig,
  WorkflowDefinition,
  WorkflowNode,
  WorkflowNodeType,
} from "@/gradient/types/workflow";
import { NODE_LABELS } from "@/gradient/types/workflow";

import StepConfigSheet from "./StepConfigSheet";
import {
  defaultConfig,
  definitionFromOrder,
  describeStep,
  isStepIncomplete,
  newNodeId,
  orderedNodes,
} from "./stepHelpers";

interface Props {
  workflowId: string;
  definition: WorkflowDefinition;
  onChange: (definition: WorkflowDefinition) => void;
  readOnly?: boolean;
}

const STEP_TYPES: {
  type: WorkflowNodeType;
  Icon: typeof Mail;
  tint: string;
}[] = [
  { type: "sendEmail", Icon: Mail, tint: "text-sky-600" },
  { type: "wait", Icon: Clock, tint: "text-amber-600" },
  { type: "exit", Icon: LogOut, tint: "text-emerald-600" },
];

const iconFor = (type: WorkflowNodeType) =>
  STEP_TYPES.find((s) => s.type === type) ?? STEP_TYPES[0];

/**
 * Defined at module scope, not inside the editor.
 *
 * A component created during render is a *new type* on every render, so React
 * unmounts and remounts its whole subtree — which for a dropdown means the menu
 * closes the instant anything above it changes state. Cheap to get wrong,
 * annoying to diagnose.
 */
function AddStepButton({
  label,
  onPick,
}: {
  label: string;
  onPick: (type: WorkflowNodeType) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border-2 border-dashed border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition hover:border-primary hover:text-primary"
        >
          <Plus className="h-3 w-3" />
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        {STEP_TYPES.map(({ type, Icon, tint }) => (
          <DropdownMenuItem key={type} onClick={() => onPick(type)}>
            <Icon className={`h-4 w-4 mr-2 ${tint}`} />
            {NODE_LABELS[type]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The linear step editor.
 *
 * A vertical sequence, because that is what an automation is until the branch
 * node ships in phase 5 — and a list is a complete editor for
 * `send → wait → send`, which is what the first several workflows will be. The
 * canvas arrives *with* branching, when a flat list genuinely stops working.
 */
export default function StepsTab({
  workflowId,
  definition,
  onChange,
  readOnly = false,
}: Props) {
  const nodes = orderedNodes(definition);

  const [editing, setEditing] = useState<WorkflowNode | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const commit = (next: WorkflowNode[]) => onChange(definitionFromOrder(next));

  /** Inserts at a position, so a step can be added between two others. */
  const addStep = (type: WorkflowNodeType, at: number) => {
    const node: WorkflowNode = {
      id: newNodeId(),
      type,
      config: defaultConfig(type),
    };

    const next = [...nodes];
    next.splice(at, 0, node);
    commit(next);

    // Straight into the config. A step with no subject is not something
    // anybody wants to look at in a list.
    setEditing(node);
    setDialogOpen(true);
  };

  const removeStep = (id: string) => commit(nodes.filter((n) => n.id !== id));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= nodes.length) return;

    const next = [...nodes];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  const saveConfig = (config: NodeConfig) => {
    if (!editing) return;
    commit(nodes.map((n) => (n.id === editing.id ? { ...n, config } : n)));
  };

  return (
    <div className="space-y-3">
      {nodes.length === 0 ? (
        <div className="rounded-md border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            No steps yet. Most automations start with an email.
          </p>
          {!readOnly && (
            <AddStepButton
              label="Add the first step"
              onPick={(type) => addStep(type, 0)}
            />
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {nodes.map((node, index) => {
            const { Icon, tint } = iconFor(node.type);
            const incomplete = isStepIncomplete(node);

            return (
              <div key={node.id}>
                <div
                  className="group flex items-center gap-3 rounded-md border bg-white px-3 py-2.5 cursor-pointer hover:border-primary/40"
                  onClick={() => {
                    setEditing(node);
                    setDialogOpen(true);
                  }}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
                    {index + 1}
                  </div>

                  <Icon className={`h-4 w-4 shrink-0 ${tint}`} />

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {NODE_LABELS[node.type]}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {describeStep(node)}
                    </div>
                  </div>

                  {/* An amber dot, not a blocking error. The publish dialog is
                      what refuses; this only says "come back to this one". */}
                  {incomplete && (
                    <span
                      className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700"
                      title="Needs filling in before this can be published"
                    >
                      Unfinished
                    </span>
                  )}

                  {!readOnly && (
                    <div
                      className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Move up"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Move down"
                        disabled={index === nodes.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        title="Remove"
                        onClick={() => removeStep(node.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>

                {!readOnly && (
                  <div className="flex justify-center py-1">
                    <AddStepButton
                      label="Add step"
                      onPick={(type) => addStep(type, index + 1)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <StepConfigSheet
        workflowId={workflowId}
        node={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={saveConfig}
        readOnly={readOnly}
      />
    </div>
  );
}

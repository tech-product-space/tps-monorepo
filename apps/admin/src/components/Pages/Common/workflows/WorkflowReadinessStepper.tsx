"use client";

import { Check, Circle, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Workflow } from "@/types/workflow";

/**
 * Compute readiness across the four stages a workflow must complete:
 *   1. Has at least one action step (Send email) before the Goal
 *   2. Has a trigger configured (static_list or new_lead) with a non-empty
 *      recipient filter
 *   3. Is published (status === active or paused)
 *   4. Has run / is auto-firing (active_enrollments > 0 OR has run at least
 *      once — we infer from current_version >= 1 plus active status)
 */
export type StageId = "build" | "trigger" | "publish" | "run";

export interface Stage {
  id: StageId;
  title: string;
  hint: string;
  state: "done" | "current" | "todo";
}

export function computeStages(
  workflow: Workflow,
  activeEnrollments: number,
  completedEnrollments: number
): Stage[] {
  const nodes = workflow.draft_definition?.nodes || [];
  const hasAction = nodes.some((n) => n.type !== "control.goal");

  const tcfg: any = workflow.trigger_config;
  const triggerSources = tcfg?.config?.recipient_filter?.sources || [];
  const triggerConfigured =
    !!tcfg?.type && Array.isArray(triggerSources) && triggerSources.length > 0;

  const published =
    workflow.status === "active" || workflow.status === "paused";
  const isRealtime = tcfg?.type === "trigger.new_lead";
  const hasFired = activeEnrollments + completedEnrollments > 0;

  const stages: Stage[] = [
    {
      id: "trigger",
      title: "Pick a trigger",
      hint: triggerConfigured
        ? isRealtime
          ? "Real-time: auto-enrolls on new leads"
          : "Static list: enroll on Run"
        : "Choose who enters this workflow",
      state: triggerConfigured ? "done" : "current",
    },
    {
      id: "build",
      title: "Build the flow",
      hint: hasAction
        ? "At least one action before Goal"
        : "Add a Send email or Wait step",
      state: hasAction ? "done" : triggerConfigured ? "current" : "todo",
    },
    {
      id: "publish",
      title: "Publish",
      hint: published
        ? `Version ${workflow.current_version}`
        : "Lock the flow & make it active",
      state: published
        ? "done"
        : triggerConfigured && hasAction
        ? "current"
        : "todo",
    },
    {
      id: "run",
      title: isRealtime ? "Auto-enrolls" : "Run",
      hint: hasFired
        ? `${activeEnrollments} active · ${completedEnrollments} completed`
        : isRealtime
        ? "Waiting for matching leads"
        : "Click Run to enroll your list",
      state: hasFired ? "done" : published ? "current" : "todo",
    },
  ];

  return stages;
}

export default function WorkflowReadinessStepper({
  workflow,
  activeEnrollments,
  completedEnrollments,
}: {
  workflow: Workflow;
  activeEnrollments: number;
  completedEnrollments: number;
}) {
  const stages = computeStages(
    workflow,
    activeEnrollments,
    completedEnrollments
  );

  // Hide the stepper entirely once the workflow has fired — the user knows
  // how it works at that point and the stats row covers the running state.
  const allDone = stages.every((s) => s.state === "done");
  if (allDone) return null;

  return (
    <Card className="bg-gradient-to-r from-zinc-50 to-white">
      <div className="px-4 py-3">
        <ol className="flex items-stretch gap-2 overflow-x-auto">
          {stages.map((s, i) => (
            <li
              key={s.id}
              className={`flex items-center gap-3 flex-1 min-w-[180px] px-3 py-2 rounded-md border ${
                s.state === "current"
                  ? "border-primary/40 bg-primary/5"
                  : "border-transparent"
              }`}
            >
              <StageIcon state={s.state} index={i + 1} />
              <div className="min-w-0 flex-1">
                <div
                  className={`text-sm font-medium leading-tight ${
                    s.state === "todo" ? "text-muted-foreground" : ""
                  }`}
                >
                  {s.title}
                </div>
                <div
                  className={`text-xs leading-tight mt-0.5 ${
                    s.state === "current"
                      ? "text-primary"
                      : s.state === "done"
                      ? "text-emerald-700"
                      : "text-muted-foreground"
                  }`}
                >
                  {s.hint}
                </div>
              </div>
              {i < stages.length - 1 && (
                <div
                  className={`hidden md:block w-6 h-px ${
                    stages[i + 1].state !== "todo"
                      ? "bg-emerald-300"
                      : "bg-zinc-200"
                  }`}
                  aria-hidden
                />
              )}
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

function StageIcon({ state, index }: { state: Stage["state"]; index: number }) {
  if (state === "done") {
    return (
      <div className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
        <Check className="h-4 w-4" />
      </div>
    );
  }
  if (state === "current") {
    return (
      <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 text-xs font-semibold">
        {index}
      </div>
    );
  }
  return (
    <div className="h-7 w-7 rounded-full border-2 border-zinc-200 text-zinc-400 flex items-center justify-center shrink-0 text-xs font-semibold">
      {index}
    </div>
  );
}

// Surface stage state to the detail page so tabs can show warning dots.
export { Circle, AlertCircle };

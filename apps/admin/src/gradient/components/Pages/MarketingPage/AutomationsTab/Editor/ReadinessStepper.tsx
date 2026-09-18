"use client";

import { Check, Loader2 } from "lucide-react";

import type { EnrollmentStatus, Workflow } from "@/gradient/types/workflow";
import { describeTriggerGap, isTriggerComplete, stepsReadiness } from "./stepHelpers";

interface Props {
  workflow: Workflow;
  /** Enrolment counts by status, from the detail endpoint. */
  stats?: Record<EnrollmentStatus, number>;
  /** A static-list Run still working through its audience. */
  running?: boolean;
}

type StageState = "done" | "current" | "todo";

/**
 * Four stages, so a new admin can see what is left.
 *
 * **A tick means the stage is genuinely finished**, not merely started. It used
 * to mean "a trigger type has been picked" and "a Send email step exists",
 * which went green for a realtime trigger watching nothing and for an email
 * with no subject — both of which enrol or send precisely nobody. A checklist
 * that goes green early is worse than no checklist, because it sends people to
 * Publish to find out what is wrong.
 *
 * **The last stage can now be finished too.** It used to be the one stage with
 * no `done` branch at all — pressing Run left it sitting on "current" forever,
 * and the whole component then hid itself the moment anybody was enrolled, so
 * the fourth tick was not merely hard to see, it did not exist. Now the run
 * completes like the others, and the collapsed line below is what replaces the
 * checklist rather than a blank space where it used to be.
 *
 * The detail line says *what* is missing rather than just that something is, so
 * the fix does not need a round trip through the publish dialog.
 */
export default function ReadinessStepper({ workflow, stats, running }: Props) {
  const triggerReady = isTriggerComplete(workflow);
  const triggerGap = describeTriggerGap(workflow);

  const steps = stepsReadiness(workflow.definition);

  const published =
    workflow.status === "active" || workflow.status === "paused";

  const isRealtime = workflow.triggerType === "newActivity";

  /**
   * Anybody at all, in any state.
   *
   * Not just `active`: a short workflow can have finished everyone it enrolled
   * within a minute, and "nobody is active" would then read as "it never ran".
   */
  const enrolled = stats
    ? Object.values(stats).reduce((total, n) => total + (n || 0), 0)
    : 0;

  /**
   * The run is done when somebody actually entered the workflow — not when the
   * button was pressed. Run only *queues* the work, and a queue with no worker
   * behind it accepts a job and enrols nobody, which is exactly the state that
   * must not show a green tick.
   */
  const hasRun = Boolean(workflow.lastRunAt) || enrolled > 0;

  const stages: { title: string; detail: string; state: StageState }[] = [
    {
      title: "Pick a trigger",
      detail: triggerGap ?? "Ready",
      state: triggerReady ? "done" : "current",
    },
    {
      title: "Add the steps",
      detail: steps.gap ?? "Ready",
      state: steps.complete ? "done" : triggerReady ? "current" : "todo",
    },
    {
      title: "Publish",
      detail: published ? `Version ${workflow.currentVersion}` : "Makes it live",
      state: published
        ? "done"
        : steps.complete && triggerReady
          ? "current"
          : "todo",
    },
    {
      // The last stage says something different depending on the trigger,
      // because the admin's next action is different: one is "wait", the other
      // is "press Run".
      title: isRealtime ? "Enrols automatically" : "Run it",
      detail: hasRun
        ? `${enrolled.toLocaleString()} enrolled`
        : running
          ? "Enrolling now…"
          : isRealtime
            ? "As people arrive"
            : "Enrols everyone in the list",
      state: hasRun ? "done" : published ? "current" : "todo",
    },
  ];

  /**
   * Once every stage is done the checklist has nothing left to say, so it
   * collapses to one line rather than sitting above a working automation as
   * four permanent ticks.
   */
  if (stages.every((stage) => stage.state === "done")) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50/60 px-4 py-2 text-sm text-green-900">
        <Check className="h-4 w-4 shrink-0" />
        <span>
          All set — version {workflow.currentVersion} is live and{" "}
          {enrolled.toLocaleString()}{" "}
          {enrolled === 1 ? "person has" : "people have"} been enrolled.
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-muted/30 px-4 py-3">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
        {stages.map((stage, i) => (
          <div key={stage.title} className="flex items-start gap-2.5">
            <div
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium ${
                stage.state === "done"
                  ? "bg-green-600 border-green-600 text-white"
                  : stage.state === "current"
                    ? "border-primary text-primary"
                    : "border-zinc-300 text-zinc-400"
              }`}
            >
              {stage.state === "done" ? (
                <Check className="h-3 w-3" />
              ) : stage.state === "current" && running && i === 3 ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                i + 1
              )}
            </div>

            <div className="leading-tight">
              <div
                className={`text-sm font-medium ${
                  stage.state === "todo" ? "text-muted-foreground" : ""
                }`}
              >
                {stage.title}
              </div>
              <div
                className={`text-xs mt-0.5 ${
                  // Amber only on the stage being worked on. An unfinished
                  // stage further down the list is not a problem yet.
                  stage.state === "current" && stage.detail !== "Ready"
                    ? "text-amber-700"
                    : "text-muted-foreground"
                }`}
              >
                {stage.detail}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

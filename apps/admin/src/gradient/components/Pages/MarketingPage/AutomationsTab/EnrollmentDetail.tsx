"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clock,
  GitBranch,
  Loader2,
  LogOut,
  Mail,
  SkipForward,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/gradient/components/ui/badge";
import { Button } from "@/gradient/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/gradient/components/ui/alert-dialog";

import { workflowService } from "@/gradient/services/workflowService";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import type {
  EnrollmentDetail as Detail,
  NodeRunStatus,
  WorkflowNodeType,
} from "@/gradient/types/workflow";
import {
  END_REASON_LABELS,
  ENROLLMENT_STATUS_LABELS,
  ENROLLMENT_STATUS_STYLES,
  NODE_LABELS,
} from "@/gradient/types/workflow";

const formatDateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

const RUN_ICON: Record<NodeRunStatus, { Icon: typeof Check; tint: string }> = {
  completed: { Icon: Check, tint: "text-green-600" },
  running: { Icon: Loader2, tint: "text-blue-600" },
  failed: { Icon: AlertCircle, tint: "text-red-600" },
  skipped: { Icon: SkipForward, tint: "text-zinc-400" },
};

/** Typed against `WorkflowNodeType`, so a new step type is a compile error here
 *  rather than a blank icon on the one screen people open to debug a journey. */
const STEP_ICON: Record<WorkflowNodeType, typeof Mail> = {
  sendEmail: Mail,
  wait: Clock,
  branch: GitBranch,
  exit: LogOut,
};

/**
 * One person's run through one workflow.
 *
 * The step log and their activity timeline side by side, because together they
 * answer the only question anybody actually asks about an automation:
 * **why did they get that.**
 */
export default function EnrollmentDetail({ id }: { id: string }) {
  const router = useRouter();

  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await workflowService.getEnrollment(id));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to load the enrolment"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!detail) return null;

  const { enrollment, currentStep, definition, nodeRuns, events } = detail;
  const isLive = enrollment.status === "active" || enrollment.status === "waiting";

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await workflowService.cancelEnrollment(id);
      toast.success("Journey ended. Nothing further will be sent.");
      load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not cancel"));
    } finally {
      setCancelling(false);
    }
  };

  /** Nodes in the frozen version, so a step name can be shown for each run. */
  const nodeById = new Map(
    (definition?.nodes ?? []).map((n) => [n.id, n]),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{enrollment.email}</h2>
              <Badge
                variant="outline"
                className={`font-medium ${ENROLLMENT_STATUS_STYLES[enrollment.status]}`}
              >
                {ENROLLMENT_STATUS_LABELS[enrollment.status]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {enrollment.workflow?.name} · version {enrollment.workflowVersion}
              {enrollment.name ? ` · ${enrollment.name}` : ""}
            </p>
          </div>
        </div>

        {isLive && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={cancelling}>
                End this journey
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>End this journey?</AlertDialogTitle>
                <AlertDialogDescription>
                  {enrollment.email} will not receive the remaining steps. What
                  has already been sent is unaffected, and this cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep going</AlertDialogCancel>
                <AlertDialogAction onClick={handleCancel}>
                  End it
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* ── where they are ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">Enrolled</div>
          <div className="text-sm font-medium mt-0.5">
            {formatDateTime(enrollment.enrolledAt)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            via {enrollment.enrollmentSource}
          </div>
        </div>

        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">
            {isLive ? "Currently on" : "Ended"}
          </div>
          <div className="text-sm font-medium mt-0.5">
            {isLive
              ? currentStep
                ? NODE_LABELS[currentStep.type]
                : "—"
              : formatDateTime(enrollment.completedAt)}
          </div>
          {!isLive && enrollment.endReason && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {END_REASON_LABELS[enrollment.endReason] ??
                enrollment.endReason.replace(/^error:/, "")}
            </div>
          )}
        </div>

        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">Next step due</div>
          <div className="text-sm font-medium mt-0.5">
            {isLive ? formatDateTime(enrollment.nextRunAt) : "—"}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── what we did ── */}
        <div>
          <h3 className="text-sm font-semibold mb-2">Steps that ran</h3>

          {nodeRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground rounded-md border border-dashed py-8 text-center">
              Nothing has run yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {nodeRuns.map((run) => {
                const { Icon, tint } = RUN_ICON[run.status];
                const StepIcon = STEP_ICON[run.nodeType] ?? Mail;
                const node = nodeById.get(run.nodeId);

                return (
                  <div
                    key={run.id}
                    className="flex items-start gap-3 rounded-md border px-3 py-2.5"
                  >
                    <Icon
                      className={`h-4 w-4 mt-0.5 shrink-0 ${tint} ${
                        run.status === "running" ? "animate-spin" : ""
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <StepIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        {NODE_LABELS[run.nodeType]}
                      </div>

                      {node?.type === "sendEmail" && (
                        <div className="truncate text-xs text-muted-foreground mt-0.5">
                          {(node.config as { subject?: string }).subject}
                        </div>
                      )}

                      <div className="text-xs text-muted-foreground mt-0.5">
                        {formatDateTime(run.startedAt)}
                        {run.attempt > 1 && ` · attempt ${run.attempt}`}
                      </div>

                      {/* The provider's own wording, not a paraphrase — an
                          unverified sender says so better than we could. */}
                      {run.error && (
                        <div className="text-xs text-red-600 mt-1">
                          {run.error}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── what they did ── */}
        <div>
          <h3 className="text-sm font-semibold mb-2">
            What {enrollment.name?.split(" ")[0] ?? "they"} did
          </h3>

          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground rounded-md border border-dashed py-8 text-center">
              Nothing recorded yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="rounded-md border px-3 py-2 text-sm"
                >
                  <div className="font-medium">{event.label}</div>
                  {event.subject && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {event.subject}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formatDateTime(event.occurredAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

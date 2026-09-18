"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Clock,
  GitBranch,
  Loader2,
  LogOut,
  Mail,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/gradient/components/ui/badge";
import { Button } from "@/gradient/components/ui/button";

import { workflowService } from "@/gradient/services/workflowService";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import type {
  NodeReport,
  WorkflowNodeType,
  WorkflowReport,
} from "@/gradient/types/workflow";
import { NODE_LABELS } from "@/gradient/types/workflow";

const STEP_ICON: Record<WorkflowNodeType, typeof Mail> = {
  sendEmail: Mail,
  wait: Clock,
  branch: GitBranch,
  exit: LogOut,
};

const percent = (value: number) => `${Math.round(value * 100)}%`;

/**
 * What each step did, and which way people went at each if/then.
 *
 * The branch split is the point. It has been written to
 * `workflow_node_runs.output.answer` since the branch node landed and nothing
 * read it, which made "was this branch worth adding" an unanswerable question —
 * a 50/50 split is a workflow doing real work, a 2/98 split is a step that
 * could be deleted, and the enrolment list shows neither.
 */

/** The yes/no bar. Rendered only once somebody has actually been through. */
function BranchSplit({ branch }: { branch: NonNullable<NodeReport["branch"]> }) {
  const decided = branch.yes + branch.no;

  if (!decided) {
    return (
      <p className="text-xs text-muted-foreground">
        {branch.waiting
          ? `${branch.waiting.toLocaleString()} still deciding — nobody has reached a yes or no yet.`
          : "Nobody has been through this step yet."}
      </p>
    );
  }

  const yesShare = branch.yes / decided;

  return (
    <div className="space-y-1.5">
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="bg-green-600"
          style={{ width: `${yesShare * 100}%` }}
        />
        <div
          className="bg-zinc-400"
          style={{ width: `${(1 - yesShare) * 100}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-600" />
          <span className="font-medium text-foreground">
            {branch.yes.toLocaleString()}
          </span>
          <span className="text-muted-foreground">
            yes · {percent(yesShare)}
          </span>
        </span>

        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-zinc-400" />
          <span className="font-medium text-foreground">
            {branch.no.toLocaleString()}
          </span>
          <span className="text-muted-foreground">
            no · {percent(1 - yesShare)}
          </span>
        </span>

        {/* Kept out of the percentages on purpose: their window is still open,
            so counting them as a "no" would report a worse answer than the
            truth and then quietly revise it. */}
        {branch.waiting > 0 && (
          <span className="text-muted-foreground">
            {branch.waiting.toLocaleString()} still deciding
          </span>
        )}
      </div>
    </div>
  );
}

export default function ReportTab({ workflowId }: { workflowId: string }) {
  const [report, setReport] = useState<WorkflowReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setReport(await workflowService.report(workflowId));
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not load the report"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workflowId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!report) return null;

  if (!report.totals.enrolled) {
    return (
      <p className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
        Nobody has been through this automation yet.
      </p>
    );
  }

  const TOTALS: { label: string; value: number; tint?: string }[] = [
    { label: "Enrolled", value: report.totals.enrolled },
    { label: "In progress", value: report.totals.live, tint: "text-blue-700" },
    { label: "Finished", value: report.totals.completed, tint: "text-green-700" },
    { label: "Ended early", value: report.totals.cancelled },
    { label: "Failed", value: report.totals.failed, tint: "text-red-700" },
    // Broken out because it is the one number worth acting on — the step
    // before is where to look.
    { label: "Unsubscribed", value: report.totals.optedOut, tint: "text-amber-700" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Counts every version, including people still finishing an older one.
        </p>
        <Button variant="ghost" size="sm" onClick={load} disabled={refreshing}>
          <RefreshCw
            className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {TOTALS.map((t) => (
          <div key={t.label} className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">{t.label}</div>
            <div
              className={`mt-0.5 text-lg font-semibold tabular-nums ${t.tint ?? ""}`}
            >
              {t.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {report.nodes.map((node) => {
          const Icon = STEP_ICON[node.nodeType] ?? Mail;

          return (
            <div key={node.nodeId} className="rounded-md border p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {NODE_LABELS[node.nodeType]}
                      </span>
                      {node.retired && (
                        // Honest rather than tidy: dropping these would
                        // under-report what was actually sent.
                        <Badge
                          variant="outline"
                          className="h-4 px-1.5 py-0 text-[10px] font-normal text-muted-foreground"
                        >
                          from an earlier version
                        </Badge>
                      )}
                    </div>
                    {node.label && (
                      <div className="truncate text-xs text-muted-foreground mt-0.5">
                        {node.label}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-4 text-xs">
                  <span>
                    <span className="font-medium text-foreground tabular-nums">
                      {node.reached.toLocaleString()}
                    </span>{" "}
                    <span className="text-muted-foreground">reached</span>
                  </span>

                  {node.hereNow > 0 && (
                    <span className="text-muted-foreground">
                      {node.hereNow.toLocaleString()} here now
                    </span>
                  )}

                  {node.failed > 0 && (
                    <span className="text-red-600">
                      {node.failed.toLocaleString()} failed
                    </span>
                  )}

                  {/* A skip on a send step means suppressed — they had
                      unsubscribed by the time it came round. */}
                  {node.skipped > 0 && (
                    <span className="text-muted-foreground">
                      {node.skipped.toLocaleString()} skipped
                    </span>
                  )}
                </div>
              </div>

              {node.branch && (
                <div className="mt-3 pl-6.5">
                  <BranchSplit branch={node.branch} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Loader2,
  Users,
  Zap,
  Play,
  RefreshCw,
  AlertTriangle,
  Ban,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { enrollmentService } from "@/services/workflow/enrollmentService";
import type { Enrollment, EnrollmentStatus, Workflow } from "@/types/workflow";
import { formatDataTime } from "@/utils/formatDataTime";
import { useAutomationBasePath } from "@/hooks/useAutomationBasePath";
import { EnrollmentStatusBadge } from "../WorkflowStatusBadge";

const STATUS_OPTIONS: Array<{ label: string; value: EnrollmentStatus | "all" }> = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Paused", value: "paused" },
];

type Props = {
  workflow: Workflow;
};

export default function WorkflowEnrollmentsTab({ workflow }: Props) {
  const router = useRouter();
  const basePath = useAutomationBasePath();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<EnrollmentStatus | "all">(
    "all"
  );
  const [cancellingAll, setCancellingAll] = useState(false);

  // Enrollments still being processed by the engine. Used to count what
  // "Cancel all running" will affect (terminal rows are left alone).
  const nonTerminalCount = useMemo(
    () =>
      enrollments.filter(
        (e) =>
          e.status === "active" ||
          e.status === "paused" ||
          e.status === "waiting"
      ).length,
    [enrollments]
  );

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await enrollmentService.list({
        workflow_id: workflow.id,
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: 100,
      });
      setEnrollments(data.items);
    } catch (e) {
      console.error(e);
      setError("Failed to load enrollments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, workflow.id]);

  const handleBulkCancel = async () => {
    try {
      setCancellingAll(true);
      const { cancelled } = await enrollmentService.bulkCancel(
        workflow.id,
        "bulk_cancelled_from_ui"
      );
      if (cancelled === 0) {
        toast.message("Nothing to cancel — no running enrollments.");
      } else {
        toast.success(
          `Cancelled ${cancelled} enrollment${cancelled === 1 ? "" : "s"}.`
        );
      }
      await fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to cancel enrollments");
    } finally {
      setCancellingAll(false);
    }
  };

  const triggerType = workflow.trigger_config?.type;
  const isRealtime = triggerType === "trigger.new_lead";
  const isStaticList = triggerType === "trigger.static_list";
  const published =
    workflow.status === "active" || workflow.status === "paused";

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as any)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={cancellingAll || nonTerminalCount === 0}
                title={
                  nonTerminalCount === 0
                    ? "No running enrollments to cancel"
                    : "Cancel everyone still in this workflow"
                }
              >
                <Ban className="h-3.5 w-3.5 mr-2" />
                Cancel all running
                {nonTerminalCount > 0 && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    ({nonTerminalCount})
                  </span>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel all running enrollments?</AlertDialogTitle>
                <AlertDialogDescription>
                  This cancels every lead currently active, paused, or waiting
                  in <strong>{workflow.name}</strong>. Already-sent emails are
                  not recalled. Completed, failed, or already-cancelled
                  enrollments are left alone. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Back</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleBulkCancel}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  Cancel all
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading && (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && error && (
            <div className="text-center py-16 text-destructive">{error}</div>
          )}
          {!loading && !error && enrollments.length === 0 && (
            <EnrollmentsEmptyState
              published={published}
              isRealtime={isRealtime}
              isStaticList={isStaticList}
              hasTrigger={!!triggerType}
              statusFilter={statusFilter}
            />
          )}
          {!loading && !error && enrollments.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Current node</TableHead>
                  <TableHead>Enrolled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollments.map((e) => (
                  <TableRow
                    key={e.id}
                    className="cursor-pointer hover:bg-muted hover:shadow-sm transition-colors"
                    onClick={() =>
                      router.push(`${basePath}/automation/enrollments/${e.id}`)
                    }
                  >
                    <TableCell>
                      <div className="font-medium">
                        {e.lead_name_snapshot || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {e.lead_email_snapshot || "no email"}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {e.lead_source_type}
                      <br />
                      <span className="text-muted-foreground">
                        {e.lead_source_id}
                      </span>
                    </TableCell>
                    <TableCell>
                      <EnrollmentStatusBadge status={e.status} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {e.current_node_id || "—"}
                    </TableCell>
                    <TableCell>{formatDataTime(e.enrolled_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EnrollmentsEmptyState({
  published,
  isRealtime,
  isStaticList,
  hasTrigger,
  statusFilter,
}: {
  published: boolean;
  isRealtime: boolean;
  isStaticList: boolean;
  hasTrigger: boolean;
  statusFilter: string;
}) {
  // Status filter is the simplest case — likely just no rows in that bucket
  if (statusFilter !== "all") {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        No enrollments in <strong>{statusFilter}</strong> status.
      </div>
    );
  }

  if (!published) {
    return (
      <div className="py-12 text-center flex flex-col items-center max-w-md mx-auto px-6">
        <AlertTriangle className="h-10 w-10 text-amber-500 mb-3" />
        <div className="font-medium mb-1">Workflow isn't published yet</div>
        <p className="text-sm text-muted-foreground">
          Once you publish, leads can start moving through the flow.
          {!hasTrigger && " Set up a trigger first."}
        </p>
      </div>
    );
  }

  if (isRealtime) {
    return (
      <div className="py-12 text-center flex flex-col items-center max-w-md mx-auto px-6">
        <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3">
          <Zap className="h-5 w-5" />
        </div>
        <div className="font-medium mb-1">Waiting for new leads</div>
        <p className="text-sm text-muted-foreground">
          This workflow auto-enrolls anyone matching the trigger. As soon as
          someone fills the watched form, an enrollment will appear here.
        </p>
        <p className="text-xs text-muted-foreground mt-3">
          Tip: click <strong>Enroll one (test)</strong> in the header to try it
          with a known lead.
        </p>
      </div>
    );
  }

  if (isStaticList) {
    return (
      <div className="py-12 text-center flex flex-col items-center max-w-md mx-auto px-6">
        <div className="h-10 w-10 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center mb-3">
          <Play className="h-5 w-5" />
        </div>
        <div className="font-medium mb-1">Nothing enrolled yet</div>
        <p className="text-sm text-muted-foreground">
          Click <strong>Run</strong> in the header to enroll the leads matching
          the static-list filter.
        </p>
      </div>
    );
  }

  return (
    <div className="py-12 text-center flex flex-col items-center text-muted-foreground">
      <Users className="h-10 w-10 mb-3 opacity-40" />
      <div className="text-sm">No enrollments yet</div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { enrollmentService } from "@/services/workflow/enrollmentService";
import type { Enrollment, EnrollmentStatus } from "@/types/workflow";
import { formatDataTime } from "@/utils/formatDataTime";
import { useAutomationBasePath } from "@/hooks/useAutomationBasePath";
import { EnrollmentStatusBadge } from "./WorkflowStatusBadge";

const STATUS_OPTIONS: Array<{ label: string; value: EnrollmentStatus | "all" }> = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Paused", value: "paused" },
];

const EnrollmentListPage = () => {
  const router = useRouter();
  const basePath = useAutomationBasePath();
  const [items, setItems] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<EnrollmentStatus | "all">(
    "all"
  );
  const [workflowIdFilter, setWorkflowIdFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 25;

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await enrollmentService.list({
        status: statusFilter === "all" ? undefined : statusFilter,
        workflow_id: workflowIdFilter.trim() || undefined,
        page,
        limit,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      console.error(e);
      setError("Failed to load enrollments");
    } finally {
      setLoading(false);
    }
  };

  // Reset to page 1 when the workflow filter changes — the search delay
  // ensures we don't double-fetch when this state ticks.
  useEffect(() => {
    if (page !== 1) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowIdFilter]);

  // Single debounced effect — previously two effects fired in parallel on
  // mount which caused the list to load twice.
  const firstRun = useRef(true);
  useEffect(() => {
    const delay = firstRun.current ? 0 : 300;
    const t = setTimeout(() => {
      fetchData();
      firstRun.current = false;
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, page, workflowIdFilter]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6 h-full overflow-y-auto">
      <div className="flex px-8 py-5 items-center justify-between">
        <h1 className="border-b text-2xl font-semibold">Enrollments</h1>
      </div>

      <div className="flex gap-3 px-8 items-center">
        <Input
          placeholder="Filter by workflow id"
          value={workflowIdFilter}
          onChange={(e) => setWorkflowIdFilter(e.target.value)}
          className="max-w-sm"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as any);
            setPage(1);
          }}
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
      </div>

      <Card className="mx-8">
        <CardContent className="p-0">
          {loading && (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-16 text-destructive">
              {error}
              <div className="mt-4">
                <Button variant="outline" onClick={fetchData}>
                  Retry
                </Button>
              </div>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              No enrollments match the current filters
            </div>
          )}

          {!loading && !error && items.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Current node</TableHead>
                  <TableHead>Enrolled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((e) => (
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
                    <TableCell className="font-mono text-xs">
                      {e.workflow_id.slice(0, 10)}…
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

      {!loading && !error && total > limit && (
        <div className="flex items-center justify-between px-8 pb-8 text-sm">
          <div className="text-muted-foreground">
            Page {page} of {totalPages} · {total} total
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnrollmentListPage;

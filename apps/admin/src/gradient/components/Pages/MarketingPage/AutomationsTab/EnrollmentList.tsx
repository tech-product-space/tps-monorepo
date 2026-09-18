"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import { Badge } from "@/gradient/components/ui/badge";
import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import Pagination from "@/gradient/components/ui/custom/Pagination";

import { workflowService } from "@/gradient/services/workflowService";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import type { IPaginationMeta } from "@/gradient/types/pagination";
import type { Enrollment, EnrollmentStatus } from "@/gradient/types/workflow";
import {
  END_REASON_LABELS,
  ENROLLMENT_STATUS_LABELS,
  ENROLLMENT_STATUS_STYLES,
} from "@/gradient/types/workflow";

interface Props {
  /** Scopes the list to one workflow. Omitted on the standalone page. */
  workflowId?: string;
  showWorkflowColumn?: boolean;
  showSearch?: boolean;
}

const STATUS_FILTERS: { label: string; value: EnrollmentStatus | null }[] = [
  { label: "All", value: null },
  { label: "In progress", value: "active" },
  { label: "Finished", value: "completed" },
  { label: "Ended early", value: "cancelled" },
  { label: "Failed", value: "failed" },
];

const formatDateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

/**
 * Who is in a workflow and where they got to.
 *
 * One component for both the standalone Enrolments page and the editor's tab —
 * the same question, and two copies would be two places to fix a column.
 */
export default function EnrollmentList({
  workflowId,
  showWorkflowColumn = false,
  showSearch = false,
}: Props) {
  const router = useRouter();

  const [rows, setRows] = useState<Enrollment[]>([]);
  const [status, setStatus] = useState<EnrollmentStatus | null>(null);
  const [email, setEmail] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<IPaginationMeta>({
    total: 0,
    page: 1,
    limit: 25,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  // Debounced, so typing an address is not one request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setEmail(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await workflowService.listEnrollments({
        workflowId,
        status,
        email: email || undefined,
        page,
        limit,
      });
      setRows(res.data || []);
      if (res.meta) setMeta(res.meta);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to load enrolments"));
    } finally {
      setLoading(false);
    }
  }, [workflowId, status, email, page, limit]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((filter) => (
          <Button
            key={filter.label}
            variant={status === filter.value ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setStatus(filter.value);
              setPage(1);
            }}
          >
            {filter.label}
          </Button>
        ))}

        {showSearch && (
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email"
            className="h-9 w-56 ml-auto"
          />
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
          Nobody matches these filters.
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  {showWorkflowColumn && <TableHead>Automation</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead>Enrolled</TableHead>
                  <TableHead>Next step due</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer"
                    onClick={() =>
                      router.push(
                        `/marketing/automations/enrollments/${row.id}`,
                      )
                    }
                  >
                    <TableCell>
                      <div className="font-medium">{row.email}</div>
                      {row.name && (
                        <div className="text-xs text-muted-foreground">
                          {row.name}
                        </div>
                      )}
                    </TableCell>

                    {showWorkflowColumn && (
                      <TableCell className="text-sm">
                        {row.workflow?.name ?? "—"}
                      </TableCell>
                    )}

                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`font-medium ${ENROLLMENT_STATUS_STYLES[row.status]}`}
                      >
                        {ENROLLMENT_STATUS_LABELS[row.status]}
                      </Badge>
                      {/* The reason matters more than the status: "ended early"
                          could be an opt-out or an admin, and those are very
                          different things to see in a list. */}
                      {row.endReason && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {END_REASON_LABELS[row.endReason] ??
                            row.endReason.replace(/^error:/, "")}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(row.enrolledAt)}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {row.status === "active" || row.status === "waiting"
                        ? formatDateTime(row.nextRunAt)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination
            meta={meta}
            onPageChange={setPage}
            onLimitChange={(next) => {
              setLimit(next);
              setPage(1);
            }}
          />
        </>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  MailWarning,
  MoreHorizontal,
  RefreshCw,
  Send,
  Sparkles,
  Undo2,
  UserPen,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/gradient/components/ui/badge";
import { Button } from "@/gradient/components/ui/button";
import { Checkbox } from "@/gradient/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/gradient/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import { freeCourseCertificateService } from "@/gradient/services/freeCourseCertificateService";
import { CERTIFICATE_STATUS_VARIANT } from "@/gradient/types/certificate";
import type {
  FreeCourseLearner,
  FreeCourseLearnersResponse,
} from "@/gradient/types/freeCourseCertificate";
import CorrectRecipientDialog from "./CorrectRecipientDialog";

type Filter = "all" | "none" | "failed" | "notEmailed";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All finished" },
  { key: "none", label: "No certificate" },
  { key: "failed", label: "Failed" },
  { key: "notEmailed", label: "Not emailed" },
];

const formatDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

/**
 * Everyone who has finished the course, and where their certificate stands.
 *
 * This is the manual half of the feature: auto-issue covers the normal path,
 * and this covers every case it cannot — a course that was not set up when
 * somebody finished, a render that failed, an email that bounced, and anyone
 * who completed before certificates existed at all.
 */
export default function LearnersTab({
  courseId,
  onChanged,
}: {
  courseId: string;
  /** Bump the readiness banner after anything is issued. */
  onChanged?: () => void;
}) {
  const [data, setData] = useState<FreeCourseLearnersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<FreeCourseLearner | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await freeCourseCertificateService.getLearners(
        courseId,
        filter === "all" ? undefined : filter,
      );
      setData(result);
      setSelected(new Set());
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not load learners"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [courseId, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const learners = data?.learners ?? [];

  /** Finished, and nothing issued yet — the only rows Generate can act on. */
  const generatable = useMemo(
    () => learners.filter((l) => l.isComplete && !l.certificate),
    [learners],
  );

  const selectableIds = useMemo(
    () => generatable.map((l) => l.userId),
    [generatable],
  );

  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  };

  const toggleOne = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  const runGenerate = async (
    target: { userIds: string[] } | { all: true },
    label: string,
  ) => {
    setWorking(true);
    try {
      const result = await freeCourseCertificateService.generate(
        courseId,
        target,
      );

      const parts = [`${result.created} queued`];
      if (result.existing) parts.push(`${result.existing} already had one`);
      if (result.requeued) parts.push(`${result.requeued} re-queued`);
      if (result.skipped.length) parts.push(`${result.skipped.length} skipped`);

      toast.success(`${label}: ${parts.join(", ")}`);

      // Skips are the interesting half — somebody with no email address, or who
      // is not actually finished. Naming the reason beats a silent count.
      if (result.skipped.length) {
        const reasons = [...new Set(result.skipped.map((s) => s.reason))];
        toast.warning(`Skipped: ${reasons.join(", ")}`);
      }

      await load();
      onChanged?.();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not generate certificates"));
    } finally {
      setWorking(false);
    }
  };

  const rowAction = async (
    id: string,
    action: () => Promise<unknown>,
    message: string,
  ) => {
    setBusyRow(id);
    try {
      await action();
      toast.success(message);
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "That did not work"));
    } finally {
      setBusyRow(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
          {FILTERS.map((item) => (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === item.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            disabled={working || selected.size === 0}
            onClick={() =>
              runGenerate({ userIds: [...selected] }, `${selected.size} selected`)
            }
          >
            {working ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate for selected ({selected.size})
          </Button>

          <Button
            disabled={working || generatable.length === 0}
            onClick={() => runGenerate({ all: true }, "Everyone eligible")}
          >
            Generate for all ({generatable.length})
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !learners.length ? (
        <p className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          {filter === "all"
            ? "Nobody has finished this course yet."
            : "No learners match that filter."}
        </p>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    disabled={selectableIds.length === 0}
                    aria-label="Select everyone without a certificate"
                  />
                </TableHead>
                <TableHead>Learner</TableHead>
                <TableHead>Finished</TableHead>
                <TableHead>Lessons</TableHead>
                <TableHead>Certificate</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {learners.map((learner) => {
                const certificate = learner.certificate;

                // The course grew after they earned it. Their certificate is
                // still valid — this is a note, not a fault.
                const drifted =
                  certificate?.lessonsAtIssue != null &&
                  data != null &&
                  certificate.lessonsAtIssue < data.total;

                return (
                  <TableRow key={learner.userId}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(learner.userId)}
                        onCheckedChange={() => toggleOne(learner.userId)}
                        disabled={!learner.isComplete || !!certificate}
                        aria-label={`Select ${learner.name ?? "learner"}`}
                      />
                    </TableCell>

                    <TableCell>
                      <p className="font-medium">{learner.name || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {learner.email || "no email address"}
                      </p>
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(certificate?.issuedAt ?? learner.enrolledAt)}
                    </TableCell>

                    <TableCell className="text-sm">
                      <span
                        className={
                          learner.isComplete ? "" : "text-amber-600"
                        }
                      >
                        {learner.progress.completed}/{learner.progress.total}
                      </span>
                      {drifted && (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <AlertTriangle className="h-3 w-3" />
                          issued at {certificate!.lessonsAtIssue}
                        </p>
                      )}
                    </TableCell>

                    <TableCell>
                      {certificate ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                CERTIFICATE_STATUS_VARIANT[certificate.status]
                              }
                            >
                              {certificate.status}
                            </Badge>
                            {certificate.status === "Issued" &&
                              !certificate.emailSentAt && (
                                <span
                                  className="flex items-center gap-1 text-[11px] text-amber-600"
                                  title="The PDF exists but the email never went"
                                >
                                  <MailWarning className="h-3 w-3" />
                                  not emailed
                                </span>
                              )}
                          </div>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            {certificate.certificateNo}
                          </p>
                          {certificate.lastError && (
                            <p className="text-[11px] text-destructive">
                              {certificate.lastError}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      {busyRow === certificate?.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : certificate ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {(certificate.status === "Failed" ||
                              certificate.status === "Approved") && (
                              <DropdownMenuItem
                                onSelect={() =>
                                  rowAction(
                                    certificate.id,
                                    () =>
                                      freeCourseCertificateService.retry(
                                        certificate.id,
                                      ),
                                    "Re-queued",
                                  )
                                }
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                                Retry
                              </DropdownMenuItem>
                            )}

                            {certificate.status === "Issued" && (
                              <DropdownMenuItem
                                onSelect={() =>
                                  rowAction(
                                    certificate.id,
                                    () =>
                                      freeCourseCertificateService.resendEmail(
                                        certificate.id,
                                      ),
                                    "Email sent",
                                  )
                                }
                              >
                                <Send className="h-3.5 w-3.5" />
                                {certificate.emailSentAt
                                  ? "Send email again"
                                  : "Send the email"}
                              </DropdownMenuItem>
                            )}

                            <DropdownMenuItem
                              onSelect={() => setCorrecting(learner)}
                            >
                              <UserPen className="h-3.5 w-3.5" />
                              Correct the name
                            </DropdownMenuItem>

                            {certificate.status === "Revoked" ? (
                              <DropdownMenuItem
                                onSelect={() =>
                                  rowAction(
                                    certificate.id,
                                    () =>
                                      freeCourseCertificateService.restore(
                                        certificate.id,
                                      ),
                                    "Restored",
                                  )
                                }
                              >
                                <Undo2 className="h-3.5 w-3.5" />
                                Restore
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="text-destructive"
                                onSelect={() =>
                                  rowAction(
                                    certificate.id,
                                    () =>
                                      freeCourseCertificateService.revoke(
                                        certificate.id,
                                      ),
                                    "Revoked",
                                  )
                                }
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Revoke
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <CorrectRecipientDialog
        learner={correcting}
        onClose={() => setCorrecting(null)}
        onDone={async () => {
          setCorrecting(null);
          await load();
          onChanged?.();
        }}
      />
    </div>
  );
}

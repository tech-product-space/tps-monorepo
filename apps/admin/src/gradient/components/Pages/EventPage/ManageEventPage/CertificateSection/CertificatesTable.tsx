"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Loader2,
  MailWarning,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/gradient/components/ui/alert-dialog";
import { Button } from "@/gradient/components/ui/button";
import { Badge } from "@/gradient/components/ui/badge";
import { Input } from "@/gradient/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/gradient/components/ui/tooltip";
import Pagination, { IPaginationMeta } from "@/gradient/components/ui/custom/Pagination";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import { eventCertificateService } from "@/gradient/services/eventCertificateService";
import {
  CERTIFICATE_STATUS_VARIANT,
  CertificateStatus,
  EventCertificateRow,
} from "@/gradient/types/eventCertificate";
import CorrectRecipientDialog from "./CorrectRecipientDialog";

const EMPTY_META: IPaginationMeta = {
  total: 0,
  page: 1,
  limit: 10,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

const STATUSES: CertificateStatus[] = [
  "Pending",
  "Approved",
  "Issuing",
  "Issued",
  "Failed",
  "Revoked",
];

/** Radix rejects an empty SelectItem value, so "no filter" needs a sentinel. */
const ANY_STATUS = "__any";

/** Watch a render for two minutes; past that it is stuck, not slow. */
const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 30;

/**
 * A lookup, not an issuing screen.
 *
 * Certificates are generated from the Feedback tab, against the response that
 * earned them. What is left here is finding one — by number, by name, by
 * whoever is asking where theirs went — and the per-certificate remedies:
 * send one that was never sent, retry a failure, fix a name, revoke.
 */
export default function CertificatesTable({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<EventCertificateRow[]>([]);
  const [meta, setMeta] = useState<IPaginationMeta>(EMPTY_META);
  const [counts, setCounts] = useState<Partial<Record<CertificateStatus, number>>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CertificateStatus | null>(null);
  const [correcting, setCorrecting] = useState<EventCertificateRow | null>(null);
  const [confirming, setConfirming] = useState<EventCertificateRow | null>(null);

  // A ref, not state: bumping it must not re-run the polling effect itself.
  const pollsRef = useRef(0);

  // Debounced so typing a certificate number does not fire eight queries, and
  // so a slow early one cannot land after a later, narrower one.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // `silent` is for the background poll: flipping the table to its skeleton
  // every four seconds while something renders reads as the page reloading
  // itself.
  const fetchRows = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) setLoading(true);
      try {
        const res = await eventCertificateService.listCertificates(
          eventId,
          page,
          limit,
          status || undefined,
          search,
        );
        setRows(res.data);
        setMeta(res.meta);
        setCounts(res.counts);
      } catch (error) {
        if (!silent) {
          toast.error(getApiErrorMessage(error, "Failed to load certificates"));
          setRows([]);
          setMeta(EMPTY_META);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [eventId, page, limit, status, search],
  );

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // Issuing is asynchronous, so the table has to catch up on its own — an admin
  // should not have to guess when to press refresh. It stops after MAX_POLLS:
  // past that the row is stranded rather than slow, and Retry is what fixes it.
  useEffect(() => {
    const inFlight = rows.some(
      (r) => r.status === "Issuing" || r.status === "Approved",
    );

    if (!inFlight) {
      pollsRef.current = 0;
      return;
    }

    if (pollsRef.current >= MAX_POLLS) return;

    const timer = setTimeout(() => {
      pollsRef.current += 1;
      fetchRows({ silent: true });
    }, POLL_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [rows, fetchRows]);

  const runAction = async (
    id: string,
    action: () => Promise<{ message: string }>,
  ) => {
    setBusyId(id);
    try {
      const result = await action();
      toast.success(result.message);
      await fetchRows();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "That did not work"));
    } finally {
      setBusyId(null);
    }
  };

  const filtering = Boolean(search || status);

  return (
    <div className="space-y-4">
      {/* Counts are for the whole event, never the filter — they are the answer
          to "where does this event stand", which a search must not change. */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(counts) as CertificateStatus[]).map((key) => (
          <Badge key={key} variant={CERTIFICATE_STATUS_VARIANT[key]}>
            {counts[key]} {key}
          </Badge>
        ))}
        {!Object.keys(counts).length && (
          <span className="text-xs text-muted-foreground">
            No certificates yet — generate them from the Feedback tab.
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by certificate number, name or email"
            className="h-9 pl-8 pr-8"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Select
          value={status || ANY_STATUS}
          onValueChange={(value) => {
            setStatus(value === ANY_STATUS ? null : (value as CertificateStatus));
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Any status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_STATUS}>Any status</SelectItem>
            {STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !rows.length ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium">
            {filtering ? "Nothing matches" : "Nothing here yet"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {filtering
              ? "Try a different name, email or certificate number."
              : "Certificates are generated from the Feedback tab."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recipient</TableHead>
                <TableHead>Certificate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Via</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                // A PDF that exists but whose email never landed is invisible
                // in a plain status column, and it is the case an admin most
                // needs to act on.
                const emailStuck = row.status === "Issued" && !row.emailSentAt;

                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{row.recipientName}</span>
                        {row.source === "Teammate" && (
                          <Badge variant="outline" className="text-[10px]">
                            teammate
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {row.recipientEmail}
                      </p>
                    </TableCell>

                    <TableCell className="font-mono text-xs">
                      {row.certificateNo}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={CERTIFICATE_STATUS_VARIANT[row.status]}>
                          {row.status}
                        </Badge>

                        {row.lastError && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              {row.lastError}
                            </TooltipContent>
                          </Tooltip>
                        )}

                        {emailStuck && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <MailWarning className="h-3.5 w-3.5 text-amber-500" />
                            </TooltipTrigger>
                            <TooltipContent>
                              Certificate exists but the email never sent
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {row.approvedVia || "—"}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {/* Pending only happens two ways now: a correction, or
                            a recipient added by hand. Both need one deliberate
                            press to actually go out. */}
                        {row.status === "Pending" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busyId === row.id}
                                onClick={() =>
                                  runAction(row.id, async () => {
                                    const result =
                                      await eventCertificateService.approve(
                                        eventId,
                                        { certificateIds: [row.id] },
                                      );
                                    return {
                                      message: result.approved
                                        ? "Queued"
                                        : "Nothing to approve",
                                    };
                                  })
                                }
                              >
                                {busyId === row.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Send className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Approve and send</TooltipContent>
                          </Tooltip>
                        )}

                        {(row.status === "Failed" || emailStuck) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyId === row.id}
                            onClick={() =>
                              runAction(row.id, () =>
                                eventCertificateService.retry(row.id),
                              )
                            }
                          >
                            {busyId === row.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCorrecting(row)}
                          disabled={row.status === "Revoked"}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>

                        {/* Both directions confirmed: one takes a certificate
                            away from someone who has the link, the other hands
                            it back. Neither should be a stray click. */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busyId === row.id}
                              onClick={() => setConfirming(row)}
                            >
                              {busyId === row.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : row.status === "Revoked" ? (
                                <Undo2 className="h-3.5 w-3.5" />
                              ) : (
                                <Ban className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {row.status === "Revoked" ? "Restore" : "Revoke"}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {meta.totalPages > 1 && (
        <Pagination
          meta={meta}
          onPageChange={setPage}
          onLimitChange={(next) => {
            setLimit(next);
            setPage(1);
          }}
        />
      )}

      <CorrectRecipientDialog
        certificate={correcting}
        onClose={() => setCorrecting(null)}
        onSaved={fetchRows}
      />

      <AlertDialog
        open={!!confirming}
        onOpenChange={(open) => !open && setConfirming(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming?.status === "Revoked"
                ? "Restore this certificate?"
                : "Revoke this certificate?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming?.status === "Revoked" ? (
                <>
                  <span className="font-mono">{confirming?.certificateNo}</span>{" "}
                  becomes downloadable again from{" "}
                  {confirming?.recipientName}&apos;s dashboard. The number they
                  already have is the same one, so nothing needs re-sending.
                </>
              ) : (
                <>
                  <span className="font-mono">{confirming?.certificateNo}</span>{" "}
                  disappears from {confirming?.recipientName}&apos;s dashboard
                  and can no longer be downloaded. The file is kept, so you can
                  restore it later — but anyone who has not downloaded it yet
                  loses access now.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = confirming;
                setConfirming(null);
                if (!target) return;

                runAction(target.id, () =>
                  target.status === "Revoked"
                    ? eventCertificateService.restore(target.id)
                    : eventCertificateService.revoke(target.id),
                );
              }}
            >
              {confirming?.status === "Revoked" ? "Restore" : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, RefreshCw, Search, Send, X } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import Pagination, { IPaginationMeta } from "@/gradient/components/ui/custom/Pagination";
import { eventFeedbackService } from "@/gradient/services/eventFeedbackService";
import { eventCertificateService } from "@/gradient/services/eventCertificateService";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import { EventFeedback, FeedbackForm } from "@/gradient/types/eventFeedback";
import { CertificateReadiness } from "@/gradient/types/eventCertificate";
import FeedbackHeader from "./FeedbackHeader";
import FeedbackTable from "./FeedbackTable";
import FeedbackDetailDialog from "./FeedbackDetailDialog";

/**
 * How long to keep watching a render that has not finished.
 *
 * Rendering takes seconds, so anything past a couple of minutes is not slow, it
 * is stuck — and a poll that never gives up turns one stuck row into a panel
 * that reloads itself forever. Giving up says so and offers the button instead.
 */
const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 30;

const EMPTY_META: IPaginationMeta = {
  total: 0,
  page: 1,
  limit: 10,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

interface FeedbackSectionProps {
  eventId: string;
  eventSlug: string;
  canAcceptResponse: boolean;
}

/**
 * The Feedback tab is where certificates are issued.
 *
 * That is deliberate: a certificate is earned by a response, and this is the
 * only screen that shows the response, who was on it, and whether they already
 * have one. The Certificates tab is the lookup for afterwards — find one by
 * number, correct a name, revoke.
 */
export default function FeedbackSection({
  eventId,
  eventSlug,
  canAcceptResponse,
}: FeedbackSectionProps) {
  const [feedbacks, setFeedbacks] = useState<EventFeedback[]>([]);
  const [form, setForm] = useState<FeedbackForm | null>(null);
  const [meta, setMeta] = useState<IPaginationMeta>(EMPTY_META);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<EventFeedback | null>(null);
  const [readiness, setReadiness] = useState<CertificateReadiness | null>(null);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // A ref, not state: bumping it must not itself re-run the polling effect.
  const pollsRef = useRef(0);
  const [stalled, setStalled] = useState(false);

  // Typing a name should not fire a query per keystroke, and a slow one landing
  // out of order would show results for a prefix the admin has moved past.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // A background poll must not flip the table to its skeleton — a row being
  // rendered would make the whole page blink every four seconds, which is what
  // it looks like when the panel "keeps refreshing".
  const fetchFeedbacks = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) setLoading(true);
      try {
        const res = await eventFeedbackService.list(
          eventId,
          page,
          limit,
          search,
        );
        setFeedbacks(res.data);
        setMeta(res.meta);
        setForm(res.form);
      } catch (error) {
        if (!silent) {
          toast.error(getApiErrorMessage(error, "Failed to fetch responses"));
          setFeedbacks([]);
          setMeta(EMPTY_META);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [eventId, page, limit, search],
  );

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  // Generating needs a design; without one every queued job fails. The banner
  // says which piece is missing — this only decides whether to let it start.
  useEffect(() => {
    eventCertificateService
      .readiness(eventId)
      .then(setReadiness)
      .catch(() => setReadiness(null));
  }, [eventId]);

  // Rendering happens off-request, so the table has to catch up on its own —
  // an admin should not have to guess when to press refresh. But it gives up
  // after MAX_POLLS: a row that is still in progress by then is not slow, it is
  // stranded, and saying so beats reloading behind the admin's back until they
  // close the tab.
  useEffect(() => {
    const inFlight = feedbacks.some((f) => f.certificateSummary.inProgress > 0);

    if (!inFlight) {
      pollsRef.current = 0;
      if (stalled) setStalled(false);
      return;
    }

    if (pollsRef.current >= MAX_POLLS) {
      setStalled(true);
      return;
    }

    const timer = setTimeout(() => {
      pollsRef.current += 1;
      fetchFeedbacks({ silent: true });
    }, POLL_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [feedbacks, fetchFeedbacks, stalled]);

  const pageIds = useMemo(() => feedbacks.map((f) => f.id), [feedbacks]);

  const toggle = (id: string) =>
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );

  const toggleAll = () =>
    setSelectedIds((current) =>
      pageIds.every((id) => current.includes(id))
        ? current.filter((id) => !pageIds.includes(id))
        : [...new Set([...current, ...pageIds])],
    );

  /** One toast that reports what actually happened, for one row or for many. */
  const runIssue = async (payload: {
    feedbackIds?: string[];
    all?: boolean;
  }) => {
    const result = await eventCertificateService.issueFromFeedback(
      eventId,
      payload,
    );

    const notes: string[] = [];
    if (result.data.skipped) {
      notes.push(`${result.data.skipped} already had one`);
    }
    if (result.data.skippedDeclined) {
      notes.push(
        `${result.data.skippedDeclined} skipped — the guest was declined`,
      );
    }

    toast.success(
      notes.length ? `${result.message} (${notes.join(", ")})` : result.message,
    );

    // A fresh queueing earns a fresh watch, even if the last one gave up.
    pollsRef.current = 0;
    setStalled(false);
    await fetchFeedbacks();
  };

  const handleGenerate = async (feedback: EventFeedback) => {
    setGeneratingId(feedback.id);
    try {
      await runIssue({ feedbackIds: [feedback.id] });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not generate certificates"));
    } finally {
      setGeneratingId(null);
    }
  };

  const handleBulkGenerate = async () => {
    setBulkBusy(true);
    try {
      // No selection means every response on the event, not just this page —
      // paging through to catch the rest is not a thing anyone should have to do.
      await runIssue(
        selectedIds.length ? { feedbackIds: selectedIds } : { all: true },
      );
      setSelectedIds([]);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not generate certificates"));
    } finally {
      setBulkBusy(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { eventTitle, columns, rows } =
        await eventFeedbackService.export(eventId);

      if (!rows.length) {
        toast.info("There are no responses to export yet");
        return;
      }

      // `header: columns` pins the order and keeps every column present even
      // when no row happens to have a value for it — the sheet is the same
      // shape every time, which is the whole point of deriving it from the
      // form definition rather than from the data.
      const sheet = XLSX.utils.json_to_sheet(rows, { header: columns });
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Responses");

      const date = new Date().toISOString().slice(0, 10);
      const safeTitle = eventTitle.replace(/[^a-z0-9]+/gi, "_").toLowerCase();

      XLSX.writeFile(book, `${safeTitle}_responses_${date}.xlsx`);
      toast.success("Export downloaded");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to export responses"));
    } finally {
      setExporting(false);
    }
  };

  const canGenerate = Boolean(readiness?.hasTemplate);

  // Whether this event type asks for teammates at all. Read off the form
  // definition rather than a list of event types kept in step by hand — a
  // Workshop has no team, so the column would be a chevron over a 1.
  const hasTeams = Boolean(form?.fields.some((field) => field.type === "group"));

  return (
    <div className="space-y-5">
      <FeedbackHeader
        eventId={eventId}
        eventSlug={eventSlug}
        initialAcceptResponse={canAcceptResponse}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Responses</h2>
          <p className="text-xs text-muted-foreground">
            {meta.total} {meta.total === 1 ? "response" : "responses"}
            {search ? " matching" : ""}
            {selectedIds.length ? ` · ${selectedIds.length} selected` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name or email"
              className="h-9 w-56 pl-8 pr-8"
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

          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting || !meta.total}
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Export
          </Button>

          <Button
            size="sm"
            onClick={handleBulkGenerate}
            disabled={bulkBusy || !canGenerate || !meta.total}
            title={
              canGenerate
                ? undefined
                : "Design the certificate on the Certificates tab first"
            }
          >
            {bulkBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {selectedIds.length
              ? `Generate for ${selectedIds.length}`
              : "Generate for all"}
          </Button>
        </div>
      </div>

      {stalled && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span>
            Some certificates have been generating for a while without
            finishing. They are usually waiting on the server rather than lost —
            check again, or press Generate to queue them afresh.
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => {
              pollsRef.current = 0;
              setStalled(false);
              fetchFeedbacks();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Check again
          </Button>
        </div>
      )}

      <FeedbackTable
        feedbacks={feedbacks}
        loading={loading}
        selectedIds={selectedIds}
        onToggle={toggle}
        onToggleAll={toggleAll}
        expandedId={expandedId}
        onExpand={setExpandedId}
        onSelect={setSelected}
        onGenerate={handleGenerate}
        generatingId={generatingId}
        canGenerate={canGenerate}
        hasTeams={hasTeams}
      />

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

      <FeedbackDetailDialog
        feedback={selected}
        form={form}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

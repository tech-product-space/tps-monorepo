"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Eye,
  Loader2,
  Pencil,
  RefreshCcw,
  Search,
  SearchX,
  Users,
} from "lucide-react";
import * as XLSX from "xlsx";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Pagination from "@/components/ui/custom/Pagination";

import { useNotification } from "@/helpers/NotificationContext";
import { openRecordingPreview, siteUrl } from "@/lib/preview";
import { useAutomationBasePath } from "@/hooks/useAutomationBasePath";
import {
  getRecordingById,
  getRecordingLeads,
} from "@/services/recordings/recordingsService";
import { isRecordingLive } from "@/utils/recording";
import { autoSizeColumns } from "@/utils/xlsx";
import { IPaginationMeta } from "@/types/pagination";
import { RecordingLead, RecordingResponse } from "@/types/recording";

import OverviewCard from "./OverviewCard";

/** Exports fetch every page; the table only ever holds one. */
const EXPORT_LIMIT = 50;

/** Long enough that a typed address does not fire a request per keystroke. */
const SEARCH_DEBOUNCE_MS = 400;

const TABS = ["overview", "leads"] as const;
type Tab = (typeof TABS)[number];

const formatDateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export default function ManageRecordingPage() {
  const router = useRouter();
  const params = useParams();
  const basePath = useAutomationBasePath();
  const { showNotification } = useNotification();

  const recordingId = String(params?.["recording-id"] ?? "");

  const [recording, setRecording] = useState<RecordingResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const [leads, setLeads] = useState<RecordingLead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [meta, setMeta] = useState<IPaginationMeta | null>(null);
  const [exporting, setExporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  /**
   * The headline count, held apart from `meta.total`.
   *
   * `meta.total` follows the search, so the overview would read "Watched by 1
   * person" the moment somebody typed a filter — a number about the query
   * presented as a number about the recording.
   */
  const [totalLeads, setTotalLeads] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      // A filtered result set is shorter, so whatever page you were on may not
      // exist any more. Starting over is the only page guaranteed to.
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!recordingId) return;

    getRecordingById(recordingId)
      .then((res) => setRecording(res.data))
      .catch((error: any) =>
        showNotification(
          "error",
          error?.response?.data?.message || "Could not load the recording"
        )
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingId]);

  const fetchLeads = useCallback(async () => {
    if (!recordingId) return;

    setLeadsLoading(true);
    try {
      const response = await getRecordingLeads({
        recordingId,
        email: debouncedSearch.trim() || undefined,
        page,
        limit,
      });
      setLeads(response.data ?? []);
      setMeta(response.meta ?? null);
      if (!debouncedSearch.trim() && response.meta) {
        setTotalLeads(response.meta.total);
      }
    } catch (error: any) {
      showNotification(
        "error",
        error?.response?.data?.message || "Could not load leads"
      );
    } finally {
      setLeadsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingId, debouncedSearch, page, limit]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows: RecordingLead[] = [];
      let current = 1;
      let totalPages = 1;

      // Paged rather than one enormous request: the API caps `limit`, so asking
      // for everything at once would silently export the first page only.
      do {
        const response = await getRecordingLeads({
          recordingId,
          page: current,
          limit: EXPORT_LIMIT,
        });
        rows.push(...(response.data ?? []));
        totalPages = response.meta?.totalPages ?? 1;
        current += 1;
      } while (current <= totalPages);

      const sheetData = rows.map((lead) => ({
        Name: lead.name ?? "",
        Email: lead.email,
        Phone: [lead.countryCode, lead.phone].filter(Boolean).join(" "),
        "Attendee type": lead.attendeeType ?? "",
        "Role / company": lead.jobTitle ?? "",
        College: lead.collegeName ?? "",
        "Graduation year": lead.graduationYear ?? "",
        LinkedIn: lead.linkedinUrl ?? "",
        // Named for what it is. Next to somebody's name, "views" reads as a fact
        // about them rather than a count of form submissions.
        "Gate passes": lead.submissionCount,
        "First pass": formatDateTime(lead.createdAt),
        "Last pass": formatDateTime(lead.lastSubmittedAt),
      }));

      const worksheet = XLSX.utils.json_to_sheet(sheetData);
      worksheet["!cols"] = autoSizeColumns(sheetData);

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
      XLSX.writeFile(
        workbook,
        `recording-leads-${recording?.slug ?? recordingId}.xlsx`
      );
    } catch (error: any) {
      showNotification(
        "error",
        error?.response?.data?.message || "Could not export the leads"
      );
    } finally {
      setExporting(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      if (!(await openRecordingPreview(recordingId))) {
        showNotification("error", "Couldn't open the preview. Please try again");
      }
    } finally {
      setPreviewing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!recording) {
    return (
      <div className="p-6 text-sm text-gray-500">Recording not found.</div>
    );
  }

  const passes = recording.viewCount ?? 0;
  const signupRate = passes ? Math.round((totalLeads / passes) * 100) : null;
  const searching = debouncedSearch.trim().length > 0;

  return (
    <div className="flex h-screen flex-col bg-white">
      <div className="flex h-16 items-center justify-between border-b border-gray-200 px-5">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`${basePath}/recordings`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="max-w-lg truncate text-lg font-semibold text-gray-900">
            {recording.title}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Beside the stats rather than only in the editor: the overview card
              below is where a draft is diagnosed — "the page 404s for everybody,
              so no leads will arrive" — and the link that works in that state
              belongs next to the diagnosis. Once the page is public there is
              nothing to preview, so it becomes the URL itself. */}
          {isRecordingLive(recording) ? (
            <Button variant="ghost" asChild>
              <a
                href={`${siteUrl()}/recordings/${recording.slug}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View on site
              </a>
            </Button>
          ) : (
            <Button
              variant="ghost"
              onClick={handlePreview}
              disabled={previewing}
            >
              {previewing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Eye className="mr-2 h-4 w-4" />
              )}
              Preview
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exporting || !totalLeads}
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export leads
          </Button>
          <Button
            onClick={() =>
              router.push(`${basePath}/recordings/edit/${recordingId}`)
            }
          >
            <Pencil className="mr-2 h-4 w-4" />
            Edit content
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-auto bg-gray-50 p-5 pb-10">
        <OverviewCard recording={recording} leadCount={totalLeads} />

        <Tabs
          value={activeTab}
          onValueChange={(tab) => setActiveTab(tab as Tab)}
        >
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="leads">
              <Users className="mr-1.5 h-3.5 w-3.5" />
              Leads
              {totalLeads > 0 && (
                <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                  {totalLeads}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {activeTab === "overview" && (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-white p-5 lg:col-span-2">
              <h2 className="text-base font-semibold text-gray-900">
                How the gate is doing
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                Passes count every time the form was submitted; people count the
                addresses behind them.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-2xl font-semibold text-gray-900">
                    {totalLeads}
                  </p>
                  <p className="text-xs text-gray-500">People</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-gray-900">
                    {passes}
                  </p>
                  <p className="text-xs text-gray-500">Gate passes</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-gray-900">
                    {signupRate === null ? "—" : `${signupRate}%`}
                  </p>
                  <p className="text-xs text-gray-500">
                    Of passes were a new person
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-2 border-t border-gray-100 pt-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Video</span>
                  {recording.video?.videoId ? (
                    <a
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      href={recording.video.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {recording.video.videoId}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-amber-600">Not set</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Format</span>
                  <span className="text-gray-900">
                    {recording.format ?? "No badge"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Latest signup</span>
                  <span className="text-gray-900">
                    {leads.length
                      ? formatDateTime(leads[0].createdAt)
                      : "None yet"}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="mb-3 text-base font-semibold text-gray-900">
                Latest signups
              </h2>
              {leads.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Nobody has passed this gate yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {leads.slice(0, 6).map((lead) => (
                    <li key={lead.id} className="text-sm">
                      <p className="truncate font-medium text-gray-900">
                        {lead.name || lead.email}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {lead.name ? `${lead.email} · ` : ""}
                        {new Date(lead.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {totalLeads > 6 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 px-0"
                  onClick={() => setActiveTab("leads")}
                >
                  See all {totalLeads}
                </Button>
              )}
            </div>
          </div>
        )}

        {activeTab === "leads" && (
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 p-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Leads</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  {searching
                    ? `${meta?.total ?? 0} ${
                        (meta?.total ?? 0) === 1 ? "address" : "addresses"
                      } matching “${debouncedSearch.trim()}”`
                    : `${totalLeads} ${
                        totalLeads === 1 ? "person" : "people"
                      } gave an email to watch this`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* A filter over an empty table is furniture. */}
                {(totalLeads > 0 || searching) && (
                  <div className="relative w-56">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      className="pl-9"
                      placeholder="Search by email"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={fetchLeads}
                  disabled={leadsLoading}
                  title="Refresh"
                >
                  <RefreshCcw
                    className={`h-4 w-4 ${leadsLoading ? "animate-spin" : ""}`}
                  />
                </Button>
              </div>
            </div>

            {leadsLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : leads.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 p-12 text-center text-sm text-gray-500">
                {searching ? (
                  <>
                    <SearchX className="h-7 w-7 opacity-40" />
                    No lead matches that address.
                  </>
                ) : (
                  <>
                    <Users className="h-7 w-7 opacity-40" />
                    Nobody has passed this gate yet.
                  </>
                )}
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Person</TableHead>
                      <TableHead>Phone</TableHead>
                      {/* Role and college share one column: the form makes
                          exactly one of them required depending on the attendee
                          toggle, so two columns would guarantee half of each was
                          empty. */}
                      <TableHead>Role / college</TableHead>
                      <TableHead>LinkedIn</TableHead>
                      <TableHead>Gate passes</TableHead>
                      <TableHead>First pass</TableHead>
                      <TableHead>Last pass</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell>
                          <div className="font-medium text-gray-900">
                            {lead.name || "—"}
                          </div>
                          <div className="text-xs text-gray-500">
                            {lead.email}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {[lead.countryCode, lead.phone]
                            .filter(Boolean)
                            .join(" ") || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          <div>
                            {lead.attendeeType === "Student"
                              ? [lead.collegeName, lead.graduationYear]
                                  .filter(Boolean)
                                  .join(" · ") || "—"
                              : lead.jobTitle || "—"}
                          </div>
                          {lead.attendeeType && (
                            <div className="text-xs text-gray-400">
                              {lead.attendeeType}
                            </div>
                          )}
                        </TableCell>
                        {/* The one optional field on the form, so it is
                            routinely blank — shown as a link rather than the
                            raw URL, which is long enough to widen the whole
                            table on its own. */}
                        <TableCell className="text-sm">
                          {lead.linkedinUrl ? (
                            <a
                              href={lead.linkedinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                            >
                              Profile
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {lead.submissionCount}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {formatDateTime(lead.createdAt)}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {formatDateTime(lead.lastSubmittedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {meta && meta.totalPages > 1 && (
                  <div className="border-t border-gray-200 p-4">
                    <Pagination
                      meta={meta}
                      onPageChange={setPage}
                      onLimitChange={(next) => {
                        setLimit(next);
                        setPage(1);
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

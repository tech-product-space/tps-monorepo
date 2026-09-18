"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, Eye, Loader2, Mail, Search, Send, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import Pagination, { IPaginationMeta } from "@/components/ui/custom/Pagination";
import { debounce } from "@/utils/debounce";
import EmailTextEditor3 from "@/components/Rich-Text-Editor/EmailTextEditor3";
import { useNotification } from "@/helpers/NotificationContext";
import {
  deleteSubscriber,
  getAllSubscribers,
  getNewsletterHistory,
  getSubscriberStats,
  getSubscribers,
  NEWSLETTER_SENDERS,
  sendNewsletter,
  sendTestNewsletter,
  type NewsletterAudience,
  type NewsletterHistoryItem,
  type Subscriber,
  type SubscriberStats,
} from "@/services/newsletter/newsletterService";

type AudienceType = "all" | "date" | "selected";

const EMPTY_META: IPaginationMeta = {
  total: 0,
  page: 1,
  limit: 20,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function NewsletterManager() {
  const { showNotification } = useNotification();

  const [view, setView] = useState<"subscribers" | "history">("subscribers");

  // ----- subscribers (server-paginated) -----
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [meta, setMeta] = useState<IPaginationMeta>(EMPTY_META);
  const [isLoading, setIsLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "subscribed" | "unsubscribed">("all");
  const [tableDateFrom, setTableDateFrom] = useState("");
  const [tableDateTo, setTableDateTo] = useState("");

  const [stats, setStats] = useState<SubscriberStats>({
    total: 0,
    subscribed: 0,
    unsubscribed: 0,
  });

  // selection persists across pages (keyed by email)
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [deleteTarget, setDeleteTarget] = useState<Subscriber | null>(null);

  // ----- history -----
  const [history, setHistory] = useState<NewsletterHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyView, setHistoryView] = useState<NewsletterHistoryItem | null>(null);

  // ----- compose -----
  const [composeOpen, setComposeOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sender, setSender] = useState(NEWSLETTER_SENDERS[0]);
  const [audienceType, setAudienceType] = useState<AudienceType>("all");
  const [audFrom, setAudFrom] = useState("");
  const [audTo, setAudTo] = useState("");
  const [audDateCount, setAudDateCount] = useState(0);
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);

  const statusParam = statusFilter === "all" ? undefined : statusFilter;

  const fetchSubscribers = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await getSubscribers({
        page,
        limit,
        search: search || undefined,
        status: statusParam,
        from: tableDateFrom || undefined,
        to: tableDateTo || undefined,
      });
      setSubscribers(res.data || []);
      setMeta(res.meta || EMPTY_META);
    } catch (error) {
      console.error("Failed to fetch subscribers:", error);
      showNotification("error", "Failed to load subscribers", "");
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, search, statusParam, tableDateFrom, tableDateTo]);

  const fetchStats = useCallback(async () => {
    try {
      setStats(await getSubscriberStats());
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const data = await getNewsletterHistory();
      setHistory(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch history:", error);
      showNotification("error", "Failed to load history", "");
    } finally {
      setHistoryLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchSubscribers();
  }, [fetchSubscribers]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (view === "history") loadHistory();
  }, [view, loadHistory]);

  // debounced search -> resets to page 1
  const debouncedSetSearch = useMemo(
    () =>
      debounce((value: string) => {
        setSearch(value);
        setPage(1);
      }, 500),
    []
  );

  const onSearchChange = (value: string) => {
    setSearchInput(value);
    debouncedSetSearch(value);
  };

  // ----- audience date-range count (server) -----
  useEffect(() => {
    if (!composeOpen || audienceType !== "date") return;
    let active = true;
    (async () => {
      try {
        const res = await getSubscribers({
          page: 1,
          limit: 1,
          status: "subscribed",
          from: audFrom || undefined,
          to: audTo || undefined,
        });
        if (active) setAudDateCount(res.meta?.total || 0);
      } catch {
        if (active) setAudDateCount(0);
      }
    })();
    return () => {
      active = false;
    };
  }, [composeOpen, audienceType, audFrom, audTo]);

  const selectedCount = selected.size;

  const recipientCount = useMemo(() => {
    if (audienceType === "all") return stats.subscribed;
    if (audienceType === "date") return audDateCount;
    return selectedCount;
  }, [audienceType, stats.subscribed, audDateCount, selectedCount]);

  const toggleRow = (email: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const visible = subscribers.map((s) => s.email);
    const allSelected = visible.length > 0 && visible.every((e) => selected.has(e));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) visible.forEach((e) => next.delete(e));
      else visible.forEach((e) => next.add(e));
      return next;
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSubscriber(deleteTarget.id);
      showNotification("success", "Subscriber deleted", "");
      setDeleteTarget(null);
      fetchSubscribers();
      fetchStats();
    } catch (error) {
      console.error("Delete failed:", error);
      showNotification("error", "Failed to delete subscriber", "");
    }
  };

  const downloadAsExcel = async () => {
    try {
      const all = await getAllSubscribers({
        search: search || undefined,
        status: statusParam,
        from: tableDateFrom || undefined,
        to: tableDateTo || undefined,
      });
      if (!all.length) {
        showNotification("warning", "Nothing to export", "");
        return;
      }
      const rows = all.map((s) => ({
        Email: s.email,
        Status: s.status,
        "Subscribed At": new Date(s.createdAt).toLocaleString(),
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Subscribers");
      const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      saveAs(
        new Blob([buffer], { type: "application/octet-stream" }),
        "subscribers.xlsx"
      );
    } catch (error) {
      console.error("Export failed:", error);
      showNotification("error", "Export failed", "");
    }
  };

  const buildAudience = (): NewsletterAudience => {
    if (audienceType === "date") {
      return { type: "date", from: audFrom || undefined, to: audTo || undefined };
    }
    if (audienceType === "selected") {
      return { type: "selected", emails: Array.from(selected) };
    }
    return { type: "all" };
  };

  const validateContent = () => {
    if (!subject.trim()) {
      showNotification("error", "Subject is required", "");
      return false;
    }
    if (!body.trim()) {
      showNotification("error", "Email body is required", "");
      return false;
    }
    return true;
  };

  const handleSendTest = async () => {
    if (!validateContent()) return;
    if (!testEmail.trim()) {
      showNotification("error", "Enter a test email address", "");
      return;
    }
    try {
      setTesting(true);
      const res = await sendTestNewsletter({
        subject,
        html: body,
        from: sender,
        email: testEmail.trim(),
      });
      showNotification(
        res.sent > 0 ? "success" : "error",
        res.sent > 0 ? "Test email sent" : "Test email failed",
        res.sent > 0 ? `Sent to ${testEmail}` : ""
      );
    } catch (error) {
      console.error("Test send failed:", error);
      showNotification("error", "Test email failed", "");
    } finally {
      setTesting(false);
    }
  };

  const handleSend = async () => {
    if (!validateContent()) return;
    if (recipientCount === 0) {
      showNotification("error", "No recipients selected", "");
      return;
    }
    try {
      setSending(true);
      const res = await sendNewsletter({
        subject,
        html: body,
        from: sender,
        audience: buildAudience(),
      });
      showNotification(
        "success",
        "Sending started",
        `Queued for ${res.total} recipient${res.total === 1 ? "" : "s"}. See History for results.`
      );
      setComposeOpen(false);
      setSubject("");
      setBody("");
      setSelected(new Set());
    } catch (error) {
      console.error("Send failed:", error);
      showNotification("error", "Failed to send newsletter", "");
    } finally {
      setSending(false);
    }
  };

  const allVisibleSelected =
    subscribers.length > 0 && subscribers.every((s) => selected.has(s.email));

  const historyBadgeClass = (status: string) =>
    status === "sent"
      ? "bg-green-50 text-green-700 border-green-200"
      : status === "partial"
      ? "bg-yellow-50 text-yellow-700 border-yellow-200"
      : status === "sending"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : "bg-red-50 text-red-700 border-red-200";

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="px-5 h-16 flex justify-between items-center border-b border-gray-200">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            <p className="text-lg font-semibold text-gray-900">Newsletter</p>
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-md p-1">
            <button
              onClick={() => setView("subscribers")}
              className={`px-3 py-1 text-sm rounded ${
                view === "subscribers" ? "bg-white shadow font-medium" : "text-gray-500"
              }`}
            >
              Subscribers
            </button>
            <button
              onClick={() => setView("history")}
              className={`px-3 py-1 text-sm rounded ${
                view === "history" ? "bg-white shadow font-medium" : "text-gray-500"
              }`}
            >
              History
            </button>
          </div>
        </div>
        {view === "subscribers" && (
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={downloadAsExcel} className="gap-2">
              <Download className="w-4 h-4" />
              Export
            </Button>
            <Button
              onClick={() => {
                setAudienceType(selected.size > 0 ? "selected" : "all");
                setComposeOpen(true);
              }}
              className="gap-2"
            >
              <Send className="w-4 h-4" />
              Compose email
            </Button>
          </div>
        )}
      </div>

      {view === "subscribers" && (
        <>
          {/* Stats */}
          <div className="px-5 py-3 flex flex-wrap gap-4 border-b bg-gray-50 text-sm">
            <span>
              Total: <b>{stats.total}</b>
            </span>
            <span className="text-green-700">
              Subscribed: <b>{stats.subscribed}</b>
            </span>
            <span className="text-gray-500">
              Unsubscribed: <b>{stats.unsubscribed}</b>
            </span>
            {selected.size > 0 && (
              <span className="text-blue-700">
                Selected: <b>{selected.size}</b>
              </span>
            )}
          </div>

          {/* Filters */}
          <div className="px-5 py-3 flex flex-wrap items-center gap-3 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by email..."
                value={searchInput}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-8 h-9 pr-3 py-1 border rounded-md text-sm focus:outline-none focus:ring-2"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as "all" | "subscribed" | "unsubscribed");
                setPage(1);
              }}
              className="h-9 px-2 border rounded-md text-sm"
            >
              <option value="all">All statuses</option>
              <option value="subscribed">Subscribed</option>
              <option value="unsubscribed">Unsubscribed</option>
            </select>
            <div className="flex items-center gap-1 text-sm">
              <span className="text-muted-foreground">Joined</span>
              <input
                type="date"
                value={tableDateFrom}
                onChange={(e) => {
                  setTableDateFrom(e.target.value);
                  setPage(1);
                }}
                className="h-9 px-2 border rounded-md text-sm"
              />
              <span className="text-muted-foreground">to</span>
              <input
                type="date"
                value={tableDateTo}
                onChange={(e) => {
                  setTableDateTo(e.target.value);
                  setPage(1);
                }}
                className="h-9 px-2 border rounded-md text-sm"
              />
              {(tableDateFrom || tableDateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTableDateFrom("");
                    setTableDateTo("");
                    setPage(1);
                  }}
                  className="text-gray-500"
                >
                  Clear dates
                </Button>
              )}
            </div>
            {selected.size > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
                className="text-gray-500"
              >
                Clear selection
              </Button>
            )}
            <span className="ml-auto text-sm text-muted-foreground">
              {meta.total} total
            </span>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto p-5 bg-gray-50">
            <div className="rounded-md border bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                        aria-label="Select all on page"
                      />
                    </TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Subscribed At</TableHead>
                    <TableHead className="w-16">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-10">
                        <Loader2 className="h-5 w-5 animate-spin inline" />
                      </TableCell>
                    </TableRow>
                  ) : subscribers.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center py-8 text-muted-foreground"
                      >
                        No subscribers found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    subscribers.map((sub) => (
                      <TableRow key={sub.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selected.has(sub.email)}
                            onChange={() => toggleRow(sub.email)}
                            aria-label={`Select ${sub.email}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{sub.email}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              sub.status === "subscribed"
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-gray-100 text-gray-600 border-gray-200"
                            }
                          >
                            {sub.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(sub.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                            onClick={() => setDeleteTarget(sub)}
                            aria-label="Delete subscriber"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="mt-4">
              <Pagination
                meta={meta}
                onPageChange={(p) => setPage(p)}
                onLimitChange={(l) => {
                  setLimit(l);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </>
      )}

      {/* History view */}
      {view === "history" && (
        <div className="flex-1 overflow-auto p-5 bg-gray-50">
          <div className="rounded-md border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Sent / Failed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent At</TableHead>
                  <TableHead className="w-16">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10">
                      <Loader2 className="h-5 w-5 animate-spin inline" />
                    </TableCell>
                  </TableRow>
                ) : history.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No newsletters sent yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="font-medium max-w-[280px] truncate">
                        {h.subject}
                      </TableCell>
                      <TableCell className="capitalize text-sm">
                        {h.audienceType || "all"}
                        {h.audienceType === "date" && (h.audienceFrom || h.audienceTo) ? (
                          <span className="text-muted-foreground">
                            {" "}
                            ({h.audienceFrom ? formatDate(h.audienceFrom) : "…"} –{" "}
                            {h.audienceTo ? formatDate(h.audienceTo) : "…"})
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>{h.totalRecipients}</TableCell>
                      <TableCell className="text-sm">
                        <span className="text-green-700">{h.sentCount}</span>
                        {" / "}
                        <span className="text-red-600">{h.failedCount}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={historyBadgeClass(h.status)}>
                          {h.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(h.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setHistoryView(h)}
                          aria-label="View newsletter"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={loadHistory}>
              Refresh
            </Button>
          </div>
        </div>
      )}

      {/* History detail dialog */}
      <Dialog open={!!historyView} onOpenChange={(open) => !open && setHistoryView(null)}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{historyView?.subject}</DialogTitle>
          </DialogHeader>
          {historyView && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground flex flex-wrap gap-4">
                <span>From: {historyView.senderEmail}</span>
                <span>Sent: {formatDate(historyView.createdAt)}</span>
                <span>
                  {historyView.sentCount} sent / {historyView.failedCount} failed (of{" "}
                  {historyView.totalRecipients})
                </span>
              </div>
              <div
                className="border rounded-md p-4 bg-white"
                dangerouslySetInnerHTML={{ __html: historyView.body || "" }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Compose dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Compose newsletter</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Audience */}
            <div className="space-y-2 rounded-md border p-3 bg-gray-50">
              <Label>Recipients</Label>
              <div className="flex flex-col gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="audience"
                    checked={audienceType === "all"}
                    onChange={() => setAudienceType("all")}
                  />
                  All active subscribers ({stats.subscribed})
                </label>
                <label className="flex items-center gap-2 flex-wrap">
                  <input
                    type="radio"
                    name="audience"
                    checked={audienceType === "date"}
                    onChange={() => setAudienceType("date")}
                  />
                  By signup date
                  <input
                    type="date"
                    value={audFrom}
                    onChange={(e) => {
                      setAudFrom(e.target.value);
                      setAudienceType("date");
                    }}
                    className="h-8 px-2 border rounded text-sm"
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={audTo}
                    onChange={(e) => {
                      setAudTo(e.target.value);
                      setAudienceType("date");
                    }}
                    className="h-8 px-2 border rounded text-sm"
                  />
                  {audienceType === "date" && (
                    <span className="text-muted-foreground">({audDateCount})</span>
                  )}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="audience"
                    checked={audienceType === "selected"}
                    onChange={() => setAudienceType("selected")}
                    disabled={selectedCount === 0}
                  />
                  Selected subscribers ({selectedCount})
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Will send to <b>{recipientCount}</b> subscriber
                {recipientCount === 1 ? "" : "s"}. Unsubscribed and opted-out
                addresses are skipped automatically. Sent at ~4 emails/sec.
              </p>
            </div>

            {/* Sender + subject */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>From</Label>
                <select
                  value={sender}
                  onChange={(e) => setSender(e.target.value)}
                  className="w-full h-10 px-2 border rounded-md text-sm"
                >
                  {NEWSLETTER_SENDERS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject line"
                />
              </div>
            </div>

            {/* Body */}
            <div className="space-y-2">
              <Label>Email body</Label>
              <EmailTextEditor3 value={body} onChange={setBody} />
            </div>

            {/* Test send */}
            <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
              <div className="space-y-1 flex-1 min-w-[200px]">
                <Label>Send a test to</Label>
                <Input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <Button
                variant="outline"
                onClick={handleSendTest}
                disabled={testing}
                className="gap-2"
              >
                {testing && <Loader2 className="h-4 w-4 animate-spin" />}
                Send test
              </Button>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setComposeOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={sending || recipientCount === 0}
                className="gap-2"
              >
                {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                <Send className="h-4 w-4" />
                Send to {recipientCount}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete subscriber?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {deleteTarget?.email} from the newsletter list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Headset,
  Inbox,
  ListFilter,
  RefreshCw,
  Search,
} from "lucide-react";
import LoadingSpinner from "@/components/Common/Loading/HoverLoading";
import {
  listTickets,
  getStats,
  initials,
  avatarColor,
  SupportTicket,
  SupportStats,
  SupportStatus,
  SupportPriority,
  DEFAULT_STATUSES,
  STATUS_OPTIONS,
  STATUS_LABEL,
  STATUS_BADGE,
  PRIORITY_OPTIONS,
  PRIORITY_LABEL,
  PRIORITY_BADGE,
} from "@/services/support/support";
import { SupportTicketPanel } from "./SupportTicketPanel";

const POLL_MS = 20000;
const ALL_STATUS_COUNT = STATUS_OPTIONS.length;

function timeAgo(date?: string | null): string {
  if (!date) return "";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatCard({
  label,
  value,
  accent,
  ring,
}: {
  label: string;
  value: number;
  accent: string;
  ring: string;
}) {
  return (
    <div className="rounded-xl border bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow">
      <div className="flex items-center gap-3">
        <span className={`h-9 w-1.5 rounded-full ${ring}`} />
        <div>
          <div className={`text-2xl font-bold leading-none ${accent}`}>{value}</div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
        </div>
      </div>
    </div>
  );
}

export const SupportTickets = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [stats, setStats] = useState<SupportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadMore, setLoadMore] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<SupportStatus[]>(DEFAULT_STATUSES);
  const [priority, setPriority] = useState("all");
  const [cohort, setCohort] = useState("all");

  const [page, setPage] = useState(1);
  const limit = 20;
  const [hasNext, setHasNext] = useState(false);

  // Keep the latest filter values for the polling interval without re-binding it.
  const filtersRef = useRef({ search, statuses, priority, cohort });
  filtersRef.current = { search, statuses, priority, cohort };

  const statusesAreDefault =
    statuses.length === DEFAULT_STATUSES.length &&
    DEFAULT_STATUSES.every((s) => statuses.includes(s));

  const hasActiveFilters =
    search.trim() !== "" ||
    !statusesAreDefault ||
    priority !== "all" ||
    cohort !== "all";

  const fetchTickets = async (
    targetPage: number,
    append: boolean,
    silent = false
  ) => {
    const f = filtersRef.current;
    if (append) setLoadMore(true);
    else if (!silent) setLoading(true);
    try {
      const res = await listTickets({
        search: f.search,
        status: f.statuses.length ? f.statuses.join(",") : undefined,
        priority: f.priority !== "all" ? f.priority : undefined,
        cohort: f.cohort === "true" ? true : undefined,
        page: targetPage,
        limit,
      });
      setHasNext(res.meta.hasNextPage);
      if (append) {
        setTickets((prev) => [...prev, ...res.data]);
      } else {
        setTickets(res.data);
        setSelectedId((curr) =>
          curr && res.data.some((t) => t.id === curr)
            ? curr
            : res.data.length
            ? res.data[0].id
            : null
        );
      }
    } finally {
      if (append) setLoadMore(false);
      else if (!silent) setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await getStats();
      setStats(res.data);
    } catch {
      /* non-blocking */
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // Reset to page 1 whenever filters change (debounced for search).
  useEffect(() => {
    setPage(1);
    const delay = setTimeout(() => fetchTickets(1, false), 400);
    return () => clearTimeout(delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statuses, priority, cohort]);

  // Short-poll the queue (silent — no spinner, keeps selection) so new
  // tickets / incoming replies surface without a manual refresh.
  useEffect(() => {
    const id = setInterval(() => {
      fetchTickets(1, false, true);
      fetchStats();
    }, POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadNextPage = () => {
    const next = page + 1;
    setPage(next);
    fetchTickets(next, true);
  };

  const refresh = () => {
    fetchTickets(1, false);
    fetchStats();
    setReloadToken((t) => t + 1);
  };

  const handleChanged = (updated?: SupportTicket) => {
    if (updated) {
      setTickets((prev) =>
        prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t))
      );
    }
    fetchStats();
  };

  const toggleStatus = (s: SupportStatus) => {
    setStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const clearFilters = () => {
    setSearch("");
    setStatuses(DEFAULT_STATUSES);
    setPriority("all");
    setCohort("all");
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="px-3 sm:px-5 h-16 flex justify-between items-center border-b shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <SidebarTrigger size="lg" />
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600">
            <Headset className="h-4 w-4" />
          </span>
          <p className="text-lg font-semibold truncate">Support Queries</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 sm:mr-2 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowStats((s) => !s)}>
            <BarChart3 className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Analytics</span>
            {showStats ? (
              <ChevronUp className="h-4 w-4 ml-1" />
            ) : (
              <ChevronDown className="h-4 w-4 ml-1" />
            )}
          </Button>
        </div>
      </div>

      {/* Stats (hidden by default) */}
      {showStats && stats && (
        <div className="bg-gray-50/70 px-3 sm:px-5 py-4 border-b grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
          <StatCard label="Open queries" value={stats.open} accent="text-blue-600" ring="bg-blue-500" />
          <StatCard label="Cohort open" value={stats.cohortOpen} accent="text-emerald-600" ring="bg-emerald-500" />
          <StatCard label="Closed today" value={stats.closedToday} accent="text-green-600" ring="bg-green-500" />
          <StatCard label="Total" value={stats.total} accent="text-slate-700" ring="bg-slate-400" />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white px-3 sm:px-5 py-3 flex gap-3 border-b items-center flex-wrap shrink-0">
        <div className="relative w-full sm:max-w-sm sm:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search ticket #, subject, name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9"
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full sm:w-[180px] justify-start font-normal">
              <ListFilter className="h-4 w-4 mr-2 text-muted-foreground" />
              {statuses.length === 0
                ? "All statuses"
                : statuses.length === 1
                ? STATUS_LABEL[statuses[0]]
                : `${statuses.length} statuses`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b">
              <span className="text-xs font-medium text-muted-foreground">Status</span>
              <button
                className="text-xs text-blue-600 hover:underline"
                onClick={() =>
                  setStatuses((prev) =>
                    prev.length === ALL_STATUS_COUNT ? [] : [...STATUS_OPTIONS]
                  )
                }
              >
                {statuses.length === ALL_STATUS_COUNT ? "Clear all" : "Select all"}
              </button>
            </div>
            {STATUS_OPTIONS.map((v) => (
              <label
                key={v}
                className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
              >
                <Checkbox
                  checked={statuses.includes(v)}
                  onCheckedChange={() => toggleStatus(v)}
                />
                <span className="text-sm">{STATUS_LABEL[v]}</span>
              </label>
            ))}
          </PopoverContent>
        </Popover>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {PRIORITY_OPTIONS.map((v) => (
              <SelectItem key={v} value={v}>
                {PRIORITY_LABEL[v]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={cohort} onValueChange={setCohort}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Cohort member" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            <SelectItem value="true">Cohort members</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" onClick={clearFilters} className="text-muted-foreground w-full sm:w-auto">
            Clear filters
          </Button>
        )}
      </div>

      {/* Inbox: list (left) + detail (right). On mobile, show one pane at a time. */}
      <div className="flex-1 flex min-h-0">
        {/* List */}
        <div
          className={`w-full lg:w-[360px] border-r bg-white flex flex-col min-h-0 shrink-0 ${
            selectedId ? "hidden lg:flex" : "flex"
          }`}
        >
          <div className="flex-1 overflow-y-auto relative">
            {tickets.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center text-center text-muted-foreground py-16 px-6">
                <Inbox className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm font-medium text-gray-500">No queries found</p>
                <p className="text-xs mt-1">Try adjusting your filters or search.</p>
              </div>
            )}
            {tickets.map((t) => {
              const active = t.id === selectedId;
              const name = t.requester_name || t.requester?.name || "Unknown";
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`relative w-full text-left px-4 py-3 border-b transition-colors ${
                    active ? "bg-blue-50" : "hover:bg-gray-50"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-blue-600" />
                  )}
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarColor(
                        name
                      )}`}
                    >
                      {initials(name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm truncate">{name}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {timeAgo(t.last_message_at || t.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 truncate mt-0.5">{t.subject}</p>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="font-mono text-[10px] text-gray-400">
                          {t.ticket_number}
                        </span>
                        <Badge
                          className={`${STATUS_BADGE[t.status]} text-[10px] px-1.5 py-0`}
                        >
                          {STATUS_LABEL[t.status]}
                        </Badge>
                        <Badge
                          className={`${PRIORITY_BADGE[t.priority]} text-[10px] px-1.5 py-0`}
                        >
                          {PRIORITY_LABEL[t.priority]}
                        </Badge>
                        {t.is_cohort_member && (
                          <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0">
                            Cohort
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}

            {hasNext && (
              <div className="p-3">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={loadNextPage}
                  disabled={loadMore}
                >
                  {loadMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}

            {loading && (
              <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center z-10">
                <LoadingSpinner />
              </div>
            )}
          </div>
        </div>

        {/* Detail */}
        <div className={`flex-1 min-w-0 min-h-0 ${selectedId ? "block" : "hidden lg:block"}`}>
          <SupportTicketPanel
            ticketId={selectedId}
            reloadToken={reloadToken}
            onChanged={handleChanged}
            onBack={() => setSelectedId(null)}
          />
        </div>
      </div>
    </div>
  );
};

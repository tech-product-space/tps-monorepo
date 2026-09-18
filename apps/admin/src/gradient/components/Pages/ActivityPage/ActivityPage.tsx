"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { activityService } from "@/gradient/services/activityService";
import { useAuth } from "@/gradient/context/AuthContext";
import { useActivityStore } from "@/gradient/lib/store/useActivityStore";
import {
  getEntityLabel,
  splitAction,
  VERB_LABELS,
} from "@/gradient/constants/activity";
import type {
  ActivityFiltersResponse,
  ActivityLog,
  ActivityStatus,
} from "@/gradient/types/activity";
import type { IPaginationMeta } from "@/gradient/types/pagination";

import { Card, CardContent, CardHeader } from "@/gradient/components/ui/card";
import { Input } from "@/gradient/components/ui/input";
import { Button } from "@/gradient/components/ui/button";
import { Label } from "@/gradient/components/ui/label";
import Pagination from "@/gradient/components/ui/custom/Pagination";
import ActivityTable from "./components/ActivityTable";

const EMPTY_META: IPaginationMeta = {
  total: 0,
  page: 1,
  limit: 20,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

const STATUS_FILTERS: { label: string; value: ActivityStatus | null }[] = [
  { label: "All", value: null },
  { label: "Successful", value: "success" },
  { label: "Failed", value: "failure" },
];

const ActivityPage = () => {
  const { admin, loading: authLoading } = useAuth();
  const router = useRouter();

  const isSuperAdmin = admin?.role?.name === "Super Admin";

  const {
    actorId,
    entityType,
    action,
    status,
    dateFrom,
    dateTo,
    search,
    page,
    limit,
    setFilter,
    setPage,
    setLimit,
    reset,
  } = useActivityStore();

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [meta, setMeta] = useState<IPaginationMeta>(EMPTY_META);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [options, setOptions] = useState<ActivityFiltersResponse["data"]>({
    actors: [],
    entityTypes: [],
    actions: [],
  });

  // Debounced so typing in the search box does not fire a request per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useMemo(
    () => ({
      actorId,
      entityType,
      action,
      status,
      dateFrom,
      dateTo,
      search: debouncedSearch,
      page,
      limit,
    }),
    [
      actorId,
      entityType,
      action,
      status,
      dateFrom,
      dateTo,
      debouncedSearch,
      page,
      limit,
    ],
  );

  // Matches /users: bounce anyone else out rather than showing them a page
  // whose every request is a guaranteed 403.
  useEffect(() => {
    if (!authLoading && admin && !isSuperAdmin) {
      router.replace("/");
    }
  }, [admin, authLoading, isSuperAdmin, router]);

  useEffect(() => {
    if (authLoading || !isSuperAdmin) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);

      try {
        const res = await activityService.getLogs(query);

        if (cancelled) return;

        setLogs(res.data || []);
        setMeta(res.meta || EMPTY_META);
      } catch (error: unknown) {
        if (cancelled) return;

        const httpStatus = (error as { response?: { status?: number } })
          ?.response?.status;

        if (httpStatus === 403) {
          setForbidden(true);
        } else {
          toast.error("Could not load the activity log");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [query, authLoading, isSuperAdmin]);

  useEffect(() => {
    if (authLoading || !isSuperAdmin) return;

    activityService
      .getFilters()
      .then((res) => setOptions(res.data))
      .catch(() => {
        // Filter options are a convenience; the feed works without them.
      });
  }, [authLoading, isSuperAdmin]);

  const handleExport = async () => {
    try {
      await activityService.downloadCsv(query);
    } catch {
      toast.error("Export failed");
    }
  };

  // Nothing for anyone else, including while AuthContext resolves, so the feed
  // never flashes before the redirect above fires.
  if (!isSuperAdmin) return null;

  // Still reachable for a Super Admin: `requireRole` reads the role from the
  // JWT while AuthContext reads it from `/auth/me`, so a freshly promoted admin
  // looks like a Super Admin here and still 403s until they log in again.
  if (forbidden) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="font-medium">This page is restricted</p>
          <p className="mt-1 text-sm text-gray-500">
            Only Super Admins can view the activity log. If your role changed
            recently, sign out and back in.
          </p>
        </CardContent>
      </Card>
    );
  }

  const hasActiveFilter = Boolean(
    actorId || entityType || action || status || dateFrom || dateTo || search,
  );

  return (
    <Card>
      <CardHeader className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter.label}
              variant={status === filter.value ? "default" : "outline"}
              onClick={() => setFilter({ status: filter.value })}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Search</Label>
            <Input
              placeholder="Name, email or record…"
              value={search}
              onChange={(e) => setFilter({ search: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Admin</Label>
            <select
              value={actorId || ""}
              onChange={(e) => setFilter({ actorId: e.target.value || null })}
              className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
            >
              <option value="">Everyone</option>
              {options.actors.map((actor) => (
                <option key={actor.actorId} value={actor.actorId}>
                  {actor.actorName || actor.actorEmail || actor.actorId}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Area</Label>
            <select
              value={entityType || ""}
              onChange={(e) =>
                setFilter({ entityType: e.target.value || null, action: null })
              }
              className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
            >
              <option value="">All areas</option>
              {options.entityTypes.map((type) => (
                <option key={type} value={type}>
                  {getEntityLabel(type)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">From</Label>
            <Input
              type="date"
              value={dateFrom || ""}
              onChange={(e) => setFilter({ dateFrom: e.target.value || null })}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">To</Label>
            <Input
              type="date"
              value={dateTo || ""}
              onChange={(e) => setFilter({ dateTo: e.target.value || null })}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Action options are scoped to the selected area, so the list stays
                short instead of showing every verb across every entity. */}
            <select
              value={action || ""}
              onChange={(e) => setFilter({ action: e.target.value || null })}
              className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm"
            >
              <option value="">All actions</option>
              {options.actions
                .filter(
                  (item) =>
                    !entityType || splitAction(item).entityType === entityType,
                )
                .map((item) => {
                  const { entityType: type, verb } = splitAction(item);

                  return (
                    <option key={item} value={item}>
                      {VERB_LABELS[verb] || verb} · {getEntityLabel(type)}
                    </option>
                  );
                })}
            </select>

            {hasActiveFilter && (
              <Button variant="ghost" size="sm" onClick={reset}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Clear filters
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {meta.total} {meta.total === 1 ? "entry" : "entries"}
            </span>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-1 h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-md border">
          <ActivityTable
            logs={logs}
            loading={loading}
            expandedId={expandedId}
            onToggleExpand={setExpandedId}
          />
        </div>

        <Pagination
          meta={meta}
          onPageChange={setPage}
          onLimitChange={setLimit}
        />
      </CardContent>
    </Card>
  );
};

export default ActivityPage;

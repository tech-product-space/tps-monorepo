"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, History } from "lucide-react";

import { activityService } from "@/gradient/services/activityService";
import {
  describeActivity,
  formatActivityDate,
  formatRelativeTime,
  getActorName,
} from "@/gradient/constants/activity";
import type { ActivityLog } from "@/gradient/types/activity";
import { Badge } from "@/gradient/components/ui/badge";
import { Button } from "@/gradient/components/ui/button";
import ActivityDiff from "./ActivityDiff";

interface Props {
  /** Matches the backend's ACTIVITY_ENTITY value, e.g. "course". */
  entityType: string;
  entityId: string;
  /** Rows per fetch. */
  limit?: number;
  /** Single-line "Last edited by …" for a detail-page header. */
  compact?: boolean;
  className?: string;
}

/**
 * Self-fetching history for one record. Drop it into any detail page as a tab:
 *
 *   <ActivityTimeline entityType="course" entityId={id} />
 *
 * Only Super Admins can read the activity API, so a 403 renders nothing rather
 * than an error — a history panel is supplementary, and an admin without access
 * should see the page without a broken section on it.
 */
const ActivityTimeline = ({
  entityType,
  entityId,
  limit = 20,
  compact = false,
  className = "",
}: Props) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchLogs = useCallback(
    async (nextPage: number) => {
      if (!entityId) return;

      setLoading(true);

      try {
        const res = await activityService.getEntityLogs(entityType, entityId, {
          page: nextPage,
          limit: compact ? 1 : limit,
        });

        setLogs((prev) =>
          nextPage === 1 ? res.data || [] : [...prev, ...(res.data || [])],
        );
        setHasMore(Boolean(res.meta?.hasNextPage));
      } catch (error: unknown) {
        const status = (error as { response?: { status?: number } })?.response
          ?.status;

        if (status === 403) setForbidden(true);
      } finally {
        setLoading(false);
      }
    },
    [entityType, entityId, limit, compact],
  );

  useEffect(() => {
    setPage(1);
    fetchLogs(1);
  }, [fetchLogs]);

  if (forbidden) return null;

  if (compact) {
    const latest = logs[0];

    if (!latest) return null;

    return (
      <p className={`text-xs text-gray-500 ${className}`}>
        Last edited by {getActorName(latest)} ·{" "}
        {formatRelativeTime(latest.createdAt)}
      </p>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {loading && logs.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-500">
          Loading history…
        </p>
      )}

      {!loading && logs.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <History className="h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500">
            No changes recorded for this record yet.
          </p>
        </div>
      )}

      <ol className="relative space-y-1 border-l border-gray-200 pl-5">
        {logs.map((log) => {
          const { prefix, target, suffix } = describeActivity(log);
          const isOpen = expanded === log.id;
          const hasDetail =
            Object.keys(log.changes || {}).length > 0 ||
            Object.keys(log.metadata || {}).length > 0;

          return (
            <li key={log.id} className="relative py-2">
              <span className="absolute -left-[23px] top-4 h-2 w-2 rounded-full bg-gray-300" />

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {getActorName(log)}
                </span>
                <span className="text-sm text-gray-600">
                  {prefix}
                  {target ? " " : ""}
                  {target && (
                    <span className="font-medium text-gray-900">{target}</span>
                  )}
                  {suffix ? ` ${suffix}` : ""}
                </span>

                {log.status === "failure" && (
                  <Badge className="bg-red-100 text-red-700">failed</Badge>
                )}
              </div>

              <div className="mt-1 flex items-center gap-2">
                <span
                  className="text-xs text-gray-400"
                  title={formatActivityDate(log.createdAt)}
                >
                  {formatRelativeTime(log.createdAt)}
                </span>

                {hasDetail && (
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : log.id)}
                    className="flex cursor-pointer items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    {isOpen ? "Hide" : "Details"}
                    <ChevronDown
                      className={`h-3 w-3 transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                )}
              </div>

              {isOpen && (
                <div className="mt-2 rounded-md border bg-gray-50 p-3">
                  <ActivityDiff
                    changes={log.changes}
                    metadata={log.metadata}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => {
              const next = page + 1;
              setPage(next);
              fetchLogs(next);
            }}
          >
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
};

export default ActivityTimeline;

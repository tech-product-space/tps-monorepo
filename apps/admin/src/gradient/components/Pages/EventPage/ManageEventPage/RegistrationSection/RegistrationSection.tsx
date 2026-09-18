"use client";

import Pagination from "@/gradient/components/ui/custom/Pagination";
import { EventGuestStatusStats, EventRegistration } from "@/gradient/types/event";
import { IPaginationMeta } from "@/gradient/components/ui/custom/Pagination";
import EventGuestTable from "./EventGuestTable/EventGuestTable";
import BulkActions from "./BulkActions/BulkActions";
import { useEffect, useState } from "react";
import { eventService } from "@/gradient/services/eventService";
import { DownloadCsvButtonEvent } from "@/gradient/components/ui/custom/DownloadCsvButtonEvent";

export default function RegistrationSection({
  eventId,
  eventType,
  registrations,
  meta,
  regLoading,
  handlePageChange,
  handleLimitChange,
  fetchRegistrations,
}: {
  eventId: string;
  eventType?: string;
  registrations: EventRegistration[];
  meta: IPaginationMeta;
  regLoading: boolean;
  handlePageChange: (page: number) => void;
  handleLimitChange: (limit: number) => void;
  fetchRegistrations: () => void;
}) {
  const [stats, setStats] = useState<EventGuestStatusStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const fetchStats = async () => {
    try {
      setStatsLoading(true);
      const res = await eventService.getOverallGuestStatus(eventId);
      setStats(res.data);
    } finally {
      setStatsLoading(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([fetchRegistrations(), fetchStats()]);
  };

  useEffect(() => {
    if (eventId) fetchStats();
  }, [eventId]);

  const pendingCount = registrations.filter(
    (r) => r.status === "Waitlisted",
  ).length;

  const StatusSkeleton = () => (
    <div className="animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-lg p-4 border h-[72px]" />
  );

  return (
    <div className="bg-white dark:bg-zinc-950 rounded-xl border overflow-hidden">
      {/*Overalll Status*/}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 border-b">
        {statsLoading ? (
          <>
            <StatusSkeleton />
            <StatusSkeleton />
            <StatusSkeleton />
            <StatusSkeleton />
          </>
        ) : (
          <>
            <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4 border">
              <p className="text-sm text-zinc-500">Total</p>
              <p className="text-2xl font-semibold">{stats?.total || 0}</p>
            </div>

            <div className="bg-green-50 dark:bg-green-950/40 rounded-lg p-4 border">
              <p className="text-sm text-green-600">Approved</p>
              <p className="text-2xl font-semibold">
                {stats?.approved?.total || 0}
              </p>
              <p className="text-xs text-zinc-500">
                {stats?.approved?.percentage || 0}%
              </p>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-950/40 rounded-lg p-4 border">
              <p className="text-sm text-yellow-600">Waitlisted</p>
              <p className="text-2xl font-semibold">
                {stats?.waitlisted?.total || 0}
              </p>
              <p className="text-xs text-zinc-500">
                {stats?.waitlisted?.percentage || 0}%
              </p>
            </div>

            <div className="bg-red-50 dark:bg-red-950/40 rounded-lg p-4 border">
              <p className="text-sm text-red-600">Declined</p>
              <p className="text-2xl font-semibold">
                {stats?.declined?.total || 0}
              </p>
              <p className="text-xs text-zinc-500">
                {stats?.declined?.percentage || 0}%
              </p>
            </div>
          </>
        )}
      </div>

      <div className="p-6 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Attendees & Registrations</h2>

        <div className="flex flex-wrap items-center gap-2">
          {registrations.length > 0 && (
            <DownloadCsvButtonEvent
              fetchPage={(page, limit) =>
                eventService.getEventRegistrations(eventId, page, limit)
              }
              filename={`event-guests-${eventId}`}
            />
          )}

          {eventType === "Workshop" && (
            <BulkActions
              eventId={eventId}
              pendingCount={pendingCount}
              fetchRegistrations={refreshAll}
            />
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <EventGuestTable
          registrations={registrations}
          regLoading={regLoading}
          fetchRegistrations={refreshAll}
        />
      </div>

      {meta.total > 0 && (
        <Pagination
          meta={meta}
          onPageChange={handlePageChange}
          onLimitChange={handleLimitChange}
        />
      )}
    </div>
  );
}

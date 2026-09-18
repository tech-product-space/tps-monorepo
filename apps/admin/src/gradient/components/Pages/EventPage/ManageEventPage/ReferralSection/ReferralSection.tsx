"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/gradient/components/ui/button";
import { UserCheck } from "lucide-react";
import { toast } from "sonner";
import Pagination, { IPaginationMeta } from "@/gradient/components/ui/custom/Pagination";
import { DownloadCsvButtonEvent } from "@/gradient/components/ui/custom/DownloadCsvButtonEvent";
import { eventService } from "@/gradient/services/eventService";
import { ReferralLeaderboardRow, ReferralStats } from "@/gradient/types/event";
import ReferralTable from "./ReferralTable/ReferralTable";
import RefereesDialog from "./RefereesDialog/RefereesDialog";
import BulkApproveDialog from "./BulkApproveDialog/BulkApproveDialog";

const EMPTY_META: IPaginationMeta = {
  total: 0,
  page: 1,
  limit: 10,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

export default function ReferralSection({ eventId }: { eventId: string }) {
  const [referrals, setReferrals] = useState<ReferralLeaderboardRow[]>([]);
  const [meta, setMeta] = useState<IPaginationMeta>(EMPTY_META);
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [selectedReferrer, setSelectedReferrer] =
    useState<ReferralLeaderboardRow | null>(null);
  const [bulkApproveOpen, setBulkApproveOpen] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await eventService.getReferralLeaderboard(eventId, page, limit);
      setReferrals(res.data);
      setMeta(res.meta);
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to fetch referrals",
      );
      setReferrals([]);
      setMeta(EMPTY_META);
    } finally {
      setLoading(false);
    }
  }, [eventId, page, limit]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await eventService.getReferralStats(eventId);
      setStats(res.data);
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const refreshAll = async () => {
    await Promise.all([fetchLeaderboard(), fetchStats()]);
  };

  const StatSkeleton = () => (
    <div className="animate-pulse bg-zinc-100 dark:bg-zinc-800 rounded-lg p-4 border h-[72px]" />
  );

  return (
    <div className="bg-white dark:bg-zinc-950 rounded-xl border overflow-hidden">
      {/* Headline referral numbers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 border-b">
        {statsLoading ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : (
          <>
            <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4 border">
              <p className="text-sm text-zinc-500">Guests via referral</p>
              <p className="text-2xl font-semibold">
                {stats?.totalReferred || 0}
              </p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/40 rounded-lg p-4 border">
              <p className="text-sm text-blue-600">Active referrers</p>
              <p className="text-2xl font-semibold">
                {stats?.totalReferrers || 0}
              </p>
            </div>

            <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-lg p-4 border">
              <p className="text-sm text-emerald-600">Top referrer</p>
              <p className="text-lg font-semibold truncate">
                {stats?.topReferrer?.name || "-"}
              </p>
              <p className="text-xs text-zinc-500">
                {stats?.topReferrer
                  ? `${stats.topReferrer.referredCount} referred`
                  : "No referrals yet"}
              </p>
            </div>
          </>
        )}
      </div>

      <div className="p-6 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Referral Leaderboard</h2>

        <div className="flex flex-wrap items-center gap-2">
          {referrals.length > 0 && (
            <DownloadCsvButtonEvent
              fetchPage={(csvPage, csvLimit) =>
                eventService.getReferralLeaderboard(eventId, csvPage, csvLimit)
              }
              filename={`event-referrals-${eventId}`}
            />
          )}

          <Button
            variant="outline"
            className="bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 hover:text-emerald-700"
            onClick={() => setBulkApproveOpen(true)}
          >
            <UserCheck className="mr-2 h-4 w-4" />
            Bulk Approve by Referrals
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <ReferralTable
          referrals={referrals}
          loading={loading}
          onViewReferees={setSelectedReferrer}
          refresh={refreshAll}
        />
      </div>

      <Pagination
        meta={meta}
        onPageChange={setPage}
        onLimitChange={(newLimit) => {
          setLimit(newLimit);
          setPage(1);
        }}
      />

      <RefereesDialog
        eventId={eventId}
        referrer={selectedReferrer}
        onClose={() => setSelectedReferrer(null)}
      />

      <BulkApproveDialog
        eventId={eventId}
        open={bulkApproveOpen}
        onOpenChange={setBulkApproveOpen}
        refresh={refreshAll}
      />
    </div>
  );
}

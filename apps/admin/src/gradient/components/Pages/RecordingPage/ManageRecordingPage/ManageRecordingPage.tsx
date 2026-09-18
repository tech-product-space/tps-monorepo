"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Edit,
  ExternalLink,
  Eye,
  History,
  Loader2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import { Button } from "@/gradient/components/ui/button";
import { TabSwitcher } from "@/gradient/components/ui/custom/TabSwitcher";
import ActivityTimeline from "@/gradient/components/Common/ActivityTimeline/ActivityTimeline";
import { IPaginationMeta } from "@/gradient/types/pagination";

import { openRecordingPreview } from "@/gradient/lib/preview";
import { siteUrl } from "@/gradient/lib/site";
import { recordingService } from "@/gradient/services/recordingService";
import { RecordingLead, RecordingResponse } from "@/gradient/types/recording";

import LeadSection from "./LeadSection/LeadSection";
import OverviewCard, { recordingStatus } from "./OverviewCard";
import { ToggleRecordingStatus } from "../ToggleRecordingStatus";

const TABS = ["leads", "history"] as const;
type Tab = (typeof TABS)[number];

const isTab = (value: string | null): value is Tab =>
  TABS.includes((value ?? "") as Tab);

/** Long enough that a typed address does not fire a request per keystroke. */
const SEARCH_DEBOUNCE_MS = 350;

export default function ManageRecordingPage({
  recordingId,
}: {
  recordingId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [recording, setRecording] = useState<RecordingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);

  // Hand-typed "?tab=leed" falls back to the first tab rather than rendering
  // an empty screen.
  const tabFromUrl = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<Tab>(
    isTab(tabFromUrl) ? tabFromUrl : "leads",
  );

  const [leads, setLeads] = useState<RecordingLead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [meta, setMeta] = useState<IPaginationMeta>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  /**
   * The headline count, held apart from `meta.total`.
   *
   * `meta.total` follows the search, so the overview would read "Watched by 1
   * person" the moment somebody typed a filter — a number about the query
   * presented as a number about the recording.
   */
  const [totalLeads, setTotalLeads] = useState(0);

  const changeTab = (tab: Tab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    recordingService
      .getRecordingById(recordingId)
      .then((res) => setRecording(res.data))
      .catch((error) =>
        toast.error(
          error.response?.data?.message || "Could not load the recording",
        ),
      )
      .finally(() => setLoading(false));
  }, [recordingId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      // A filtered result set is shorter, so whatever page you were on may not
      // exist any more. Starting over is the only page guaranteed to.
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search]);

  const fetchLeads = useCallback(async () => {
    setLeadsLoading(true);
    try {
      const res = await recordingService.getRecordingLeads(
        recordingId,
        page,
        10,
        debouncedSearch.trim() || undefined,
      );
      setLeads(res.data ?? []);
      if (res.meta) {
        setMeta(res.meta);
        if (!debouncedSearch.trim()) setTotalLeads(res.meta.total);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not load leads");
    } finally {
      setLeadsLoading(false);
    }
  }, [recordingId, page, debouncedSearch]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      await openRecordingPreview(recordingId);
    } finally {
      setPreviewing(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Recording">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!recording) {
    return (
      <DashboardLayout title="Recording">
        <p className="text-muted-foreground">Recording not found.</p>
      </DashboardLayout>
    );
  }

  const isLive = recordingStatus(recording).label === "Live";

  return (
    <DashboardLayout
      title={recording.title}
      actions={
        <div className="flex items-center gap-2">
          {/* Only when the public URL actually resolves. Offering "View live"
              on a draft hands an admin a 404 and no explanation — Preview is
              the link that works in that state, and it is right beside it. */}
          {isLive && (
            <Button variant="ghost" asChild>
              <a
                href={`${siteUrl()}/recordings/${recording.slug}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View live
              </a>
            </Button>
          )}

          <Button
            variant="ghost"
            onClick={() => void handlePreview()}
            disabled={previewing}
          >
            {previewing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Eye className="mr-2 h-4 w-4" />
            )}
            Preview
          </Button>

          <Button
            variant="outline"
            onClick={() => router.push(`/recordings/${recording.id}`)}
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit content
          </Button>

          {/* The overview card below diagnoses the draft state — "the page
              404s for everybody, so no leads will arrive" — so the fix belongs
              beside the diagnosis rather than back on the list. */}
          <ToggleRecordingStatus
            recording={recording}
            variant="button"
            onChange={(isPublished) =>
              setRecording((prev) => (prev ? { ...prev, isPublished } : prev))
            }
          />
        </div>
      }
    >
      <div className="space-y-6">
        <OverviewCard recording={recording} leadCount={totalLeads} />

        <TabSwitcher
          tabs={[
            { value: "leads", label: "Leads", icon: Users, badge: totalLeads },
            { value: "history", label: "History", icon: History },
          ]}
          value={activeTab}
          onChange={changeTab}
        />

        {activeTab === "leads" && (
          <LeadSection
            recording={recording}
            leads={leads}
            meta={meta}
            loading={leadsLoading}
            search={search}
            onSearchChange={setSearch}
            onPageChange={setPage}
            refetch={fetchLeads}
          />
        )}

        {activeTab === "history" && (
          <ActivityTimeline entityType="recording" entityId={recording.id} />
        )}
      </div>
    </DashboardLayout>
  );
}

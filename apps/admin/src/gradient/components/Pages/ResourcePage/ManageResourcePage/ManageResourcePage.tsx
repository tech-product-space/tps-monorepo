"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import DashboardLayout from "@/gradient/components/DashboardLayout";
import { resourceService } from "@/gradient/services/resourceService";
import { ResourceResponse, ResourceLead } from "@/gradient/types/resource";
import { IPaginationMeta } from "@/gradient/components/ui/custom/Pagination";
import OverviewSection from "./OverviewSection/OverviewSection";
import LeadSection from "./LeadSection/LeadSection";

export default function ManageResourcePage({
  resourceId,
}: {
  resourceId: string;
}) {
  const [resource, setResource] = useState<ResourceResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const searchParams = useSearchParams();
  const router = useRouter();

  const isValidTab = (tab: string | null): tab is "overview" | "leads" => {
    return ["overview", "leads"].includes(tab || "");
  };

  const tabFromUrl = searchParams.get("tab");
  const initialTab = isValidTab(tabFromUrl) ? tabFromUrl : "overview";

  const [activeTab, setActiveTabState] = useState<"overview" | "leads">(
    initialTab,
  );

  useEffect(() => {
    if (isValidTab(tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTabState(tabFromUrl);
    }
  }, [tabFromUrl, activeTab]);

  const setActiveTab = (tab: "overview" | "leads") => {
    setActiveTabState(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const [leads, setLeads] = useState<ResourceLead[]>([]);
  const [meta, setMeta] = useState<IPaginationMeta>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [leadsLoading, setLeadsLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    const loadResource = async () => {
      try {
        const response = await resourceService.getResourceById(resourceId);
        setResource(response?.data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadResource();
  }, [resourceId]);

  const fetchLeads = useCallback(async () => {
    setLeadsLoading(true);
    try {
      const res = await resourceService.getResourceDownloads(
        resourceId,
        page,
        limit,
      );
      setLeads(res.data);
      setMeta(res.meta);
    } catch (error) {
      console.error(error);
    } finally {
      setLeadsLoading(false);
    }
  }, [resourceId, page, limit]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handlePageChange = (newPage: number) => setPage(newPage);
  const handleLimitChange = (newLimit: number) => setLimit(newLimit);

  if (loading) {
    return (
      <DashboardLayout title="Manage Resource">
        <div className="flex items-center justify-center p-20">
          <Loader2 className="animate-spin h-6 w-6" />
        </div>
      </DashboardLayout>
    );
  }

  if (!resource) {
    return (
      <DashboardLayout title="Manage Resource">
        <div className="p-6 text-center">
          <h2 className="text-xl font-semibold">Resource not found</h2>
          <p className="text-muted-foreground">
            The requested resource could not be retrieved.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={`Manage: ${resource.title}`}>
      <div className="space-y-6">
        <div className="flex space-x-6 border-b border-border">
          <button
            onClick={() => setActiveTab("overview")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "overview"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("leads")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "leads"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
            }`}
          >
            Downloads
          </button>
        </div>

        {activeTab === "overview" && <OverviewSection resource={resource} />}
        {activeTab === "leads" && (
          <LeadSection
            leads={leads}
            meta={meta}
            loading={leadsLoading}
            handlePageChange={handlePageChange}
            handleLimitChange={handleLimitChange}
            resourceId={resourceId}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

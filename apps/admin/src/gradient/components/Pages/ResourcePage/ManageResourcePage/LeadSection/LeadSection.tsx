"use client";

import { ResourceLead, ResourceLeadResponse } from "@/gradient/types/resource";
import Pagination, { IPaginationMeta } from "@/gradient/components/ui/custom/Pagination";
import ResourceLeadTable from "./ResourceLeadTable/ResourceLeadTable";
import { DownloadExcelButton } from "@/gradient/components/ui/custom/DownloadCsvButton";
import { resourceService } from "@/gradient/services/resourceService";

export default function LeadSection({
  leads,
  meta,
  loading,
  handlePageChange,
  handleLimitChange,
  resourceId,
}: {
  leads: ResourceLead[];
  meta: IPaginationMeta;
  loading: boolean;
  handlePageChange: (page: number) => void;
  handleLimitChange: (limit: number) => void;
  resourceId: string;
}) {
  return (
    <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
            <FileText size={20} className="text-zinc-600 dark:text-zinc-300" />
          </div> */}
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Downloads
            </h2>
            {/* <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Users who have downloaded this resource
            </p> */}
          </div>
        </div>

        {/* Action buttons could go here (e.g., Export to CSV) */}
        {leads.length > 0 && (
          <DownloadExcelButton 
            fetchPage={(page, limit) => resourceService.getResourceDownloads(resourceId, page, limit)}
            filename={`resource-leads-${resourceId}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 transition-colors"
          />
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <ResourceLeadTable leads={leads} loading={loading} />
      </div>

      {/* Pagination */}
      {meta.total > 0 && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 px-6 py-4 bg-zinc-50/30 dark:bg-zinc-900/10">
          <Pagination
            meta={meta}
            onPageChange={handlePageChange}
            onLimitChange={handleLimitChange}
          />
        </div>
      )}
    </div>
  );
}

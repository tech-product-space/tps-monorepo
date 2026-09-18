"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "@/gradient/components/DashboardLayout";
import { leadService } from "@/gradient/services/leadService";
import { Lead } from "@/gradient/types/lead";
import LeadsTable from "@/gradient/components/Pages/Leads/components/LeadsTable";
import { Card, CardContent, CardHeader } from "@/gradient/components/ui/card";
import { DownloadExcelButton } from "@/gradient/components/ui/custom/DownloadCsvButton";

export default function ExternalApplicationsPage() {
  const [applications, setApplications] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchApplications = async () => {
    try {
      setIsLoading(true);
      const res = await leadService.getExternalJobApplications();
      const data = res.data || [];
      setApplications(data);
    } catch (error) {
      console.error("Error fetching external job applications:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  return (
    <DashboardLayout title="External Job Leads">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="text-lg font-semibold">Leads</h2>
          {applications.length > 0 && (
            <DownloadExcelButton 
              fetchPage={(page, limit) => leadService.getExternalJobApplications({ page, limit })}
              filename="external-job-leads"
            />
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="flex flex-col items-center gap-3">
                <div className="h-10 w-10 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                <p className="text-sm text-gray-500">Loading leads...</p>
              </div>
            </div>
          ) : (
            <div className="rounded-md border">
              <LeadsTable 
                leads={applications} 
                showSource={true} 
                showSubSource={true} 
              />
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}

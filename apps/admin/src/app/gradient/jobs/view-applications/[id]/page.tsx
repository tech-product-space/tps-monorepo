"use client";

import { useEffect, useState, use } from "react";
import DashboardLayout from "@/gradient/components/DashboardLayout";
import { leadService } from "@/gradient/services/leadService";
import { Lead } from "@/gradient/types/lead";
import LeadsTable from "@/gradient/components/Pages/Leads/components/LeadsTable";
import { Card, CardContent, CardHeader } from "@/gradient/components/ui/card";
import { DownloadExcelButton } from "@/gradient/components/ui/custom/DownloadCsvButton";

export default function JobApplicationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [applications, setApplications] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchApplications = async () => {
    try {
      setIsLoading(true);
      const res = await leadService.getJobApplications(id);
      // Based on the user's provided response structure: { data: [...] } or { data: { ... } }
      // If it's a single application, wrap it in an array.
      const data = Array.isArray(res.data) ? res.data : res.data ? [res.data] : [];
      setApplications(data);
    } catch (error) {
      console.error("Error fetching job applications:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchApplications();
    }
  }, [id]);

  return (
    <DashboardLayout title="Job Applications">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="text-lg font-semibold">Applicants</h2>
          {applications.length > 0 && (
            <DownloadExcelButton 
              fetchPage={(page, limit) => leadService.getJobApplications(id, { page, limit })}
              filename={`job-applications-${id}`}
            />
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="flex flex-col items-center gap-3">
                <div className="h-10 w-10 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                <p className="text-sm text-gray-500">Loading applications...</p>
              </div>
            </div>
          ) : (
            <div className="rounded-md border">
              <LeadsTable 
                leads={applications} 
                showSource={false} 
                showSubSource={false} 
              />
            </div>
          )}
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}

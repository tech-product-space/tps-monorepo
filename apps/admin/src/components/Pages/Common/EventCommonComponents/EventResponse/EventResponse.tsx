"use client";

import { useEffect, useState } from "react";
import {
  IEventFeedback,
  exportEventFeedbacks,
  getEventFeedbacks,
} from "@/services/Events/eventFeedbackService";
import { Loader2, MessageSquare, ClipboardCheck, Download } from "lucide-react";
import { usePathname } from "next/navigation";
import EventResponseTable from "./EventResponseTable";
import { IPaginationMeta } from "@/types/pagination";
import Pagination from "@/components/ui/custom/Pagination";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import {
  bulkApproveCertificate,
  bulkGenerateCertificates,
} from "@/services/Events/certificateService";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface EventResponseProps {
  eventId: number;
  type?: "feedback" | "submission";
  eventType: string;
}

const EventResponse = ({
  eventId,
  type = "feedback",
  eventType,
}: EventResponseProps) => {
  const pathname = usePathname();
  const [responseData, setResponseData] = useState<IEventFeedback[]>([]);
  const [paginationMeta, setPaginationMeta] = useState<IPaginationMeta>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleConfirm = async () => {
    try {
      setIsGenerating(true);

      await bulkApproveCertificate(eventId);
      await bulkGenerateCertificates(eventId);

      await fetchResponses(eventId, paginationMeta.page, paginationMeta.limit);
      setOpen(false);
    } catch (error) {
      console.error("Bulk generation failed:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const fetchResponses = async (
    eventId: number,
    page: number,
    limit: number,
  ) => {
    try {
      setLoading(true);
      setError(null);
      const { meta, data } = await getEventFeedbacks(eventId, page, limit);
      setPaginationMeta(meta);
      setResponseData(data);
    } catch (error) {
      setError(
        `Failed to fetch ${type === "submission" ? "submissions" : "feedbacks"}`,
      );
      setResponseData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (pathname) {
      fetchResponses(eventId, paginationMeta.page, paginationMeta.limit);
    }
  }, [pathname, paginationMeta.page, paginationMeta.limit]);

  const handlePageChange = (newPage: number) => {
    setPaginationMeta((prev) => ({ ...prev, page: newPage }));
  };

  const handleLimitChange = (newLimit: number) => {
    setPaginationMeta((prev) => ({ ...prev, limit: newLimit, page: 1 }));
  };

  const handleDownloadExcel = async () => {
    try {
      setDownloading(true);

      const parts = pathname.split("/");
      const eventId = parts[parts.length - 1];
      const { data: allData } = await exportEventFeedbacks(eventId);

      // Prepare data for Excel
      const excelData = allData.map((item, index) => {
        const row: any = {
          "S.No": index + 1,
          Event: item.event?.eventTitle || "N/A",
          Name: item.name,
          Phone: item.phone,
          Email: item.user?.email || "N/A",
          "Submitted At": new Date(item.feedbackSubmittedAt).toLocaleString(),
        };

        // Add dynamic feedback data fields
        if (item.feedbackData) {
          Object.entries(item.feedbackData).forEach(([key, value]) => {
            row[key] = value;
          });
        }

        row["Certificate Generated"] = item.certificateGenerated ? "Yes" : "No";
        row["Certificate Approved"] = item.certificateApproved ? "Yes" : "No";
        row["Certificate Generated At"] = item.certificateGeneratedAt
          ? new Date(item.certificateGeneratedAt).toLocaleString()
          : "N/A";

        return row;
      });

      // Create worksheet and workbook
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        isSubmission ? "Submissions" : "Feedbacks",
      );

      // Auto-size columns
      const maxWidth = 50;
      const colWidths = Object.keys(excelData[0] || {}).map((key) => {
        const maxLength = Math.max(
          key.length,
          ...excelData.map((row) => String(row[key] || "").length),
        );
        return { wch: Math.min(maxLength + 2, maxWidth) };
      });
      worksheet["!cols"] = colWidths;

      // Generate filename
      const eventTitle = allData[0]?.event?.eventTitle || "event";
      const sanitizedTitle = eventTitle
        .replace(/[^a-z0-9]/gi, "_")
        .toLowerCase();
      const timestamp = new Date().toISOString().split("T")[0];
      const filename = `${sanitizedTitle}_${isSubmission ? "submissions" : "feedbacks"}_${timestamp}.xlsx`;

      // Download file
      XLSX.writeFile(workbook, filename);
    } catch (error) {
      console.error("Error downloading Excel:", error);
      alert("Failed to download Excel file");
    } finally {
      setDownloading(false);
    }
  };

  const isSubmission = type === "submission";
  const Icon = isSubmission ? ClipboardCheck : MessageSquare;
  const title = isSubmission ? "Event Submissions" : "Event Feedbacks";
  const countLabel = isSubmission ? "submission" : "response";

  const handleResponseTableUpdate = (item: IEventFeedback) => {
    setResponseData((prevData) =>
      prevData.map((response) => (response.id === item.id ? item : response)),
    );
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Content Area */}
      <div className="flex-1 overflow-auto">
        <div className="px-6">
          {/* Header Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 ${isSubmission ? "bg-purple-50" : "bg-blue-50"} rounded-lg`}
                >
                  <Icon
                    className={`h-6 w-6 ${isSubmission ? "text-purple-600" : "text-blue-600"}`}
                  />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    {title}
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {loading
                      ? "Loading..."
                      : `${paginationMeta.total} ${paginationMeta.total === 1 ? countLabel : `${countLabel}s`} received`}
                  </p>
                </div>
              </div>
              <div className="flex item-center gap-2">
                <AlertDialog
                  open={open}
                  onOpenChange={(value) => {
                    if (!isGenerating) {
                      setOpen(value);
                    }
                  }}
                >
                  <AlertDialogTrigger asChild>
                    <Button variant="default" disabled={loading}>
                      Bulk Generate Certificates
                    </Button>
                  </AlertDialogTrigger>

                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Generate certificates for this event?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {isGenerating
                          ? "Certificates is being generated. Please do not go back or close this dialog until the process is completed."
                          : "This will bulk approve and generate certificates for all attendees of this Event. Please do not go back or close this dialog until the process is completed"}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isGenerating}>
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => {
                          e.preventDefault();
                          if (!isGenerating) {
                            handleConfirm();
                          }
                        }}
                        disabled={isGenerating}
                      >
                        {isGenerating && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        {isGenerating ? "Generating..." : "Confirm"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {/* Download Button */}
                {paginationMeta.total > 0 && (
                  <Button
                    onClick={handleDownloadExcel}
                    disabled={downloading || loading}
                  >
                    {downloading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        Download
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-16 bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="text-center">
                <Loader2 className="animate-spin h-8 w-8 text-blue-600 mx-auto mb-3" />
                <p className="text-gray-600 text-sm">
                  Loading {isSubmission ? "submissions" : "feedbacks"}...
                </p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-600 text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Response Table */}
          {!loading && !error && responseData.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-5">
              <EventResponseTable
                eventType={eventType}
                responses={responseData}
                type={type}
                onUpdate={handleResponseTableUpdate}
              />

              {/* Pagination */}
              <Pagination
                meta={paginationMeta}
                onPageChange={handlePageChange}
                onLimitChange={handleLimitChange}
              />
            </div>
          )}

          {/* Empty State */}
          {!loading &&
            !error &&
            responseData.length === 0 &&
            paginationMeta.total === 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <Icon className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-gray-900 mb-1">
                  No {isSubmission ? "submissions" : "feedbacks"} yet
                </h3>
                <p className="text-sm text-gray-500">
                  {isSubmission
                    ? "Submission responses will appear here once attendees submit them."
                    : "Feedback responses will appear here once attendees submit them."}
                </p>
              </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default EventResponse;

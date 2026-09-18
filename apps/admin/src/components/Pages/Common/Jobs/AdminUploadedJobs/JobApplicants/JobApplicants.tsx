"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  ArrowLeft,
  Eye,
  ExternalLink,
  Calendar,
  Briefcase,
  Linkedin,
  Link2,
  Download,
  FileText,
  ArrowRight,
  MapPin,
} from "lucide-react";
import * as XLSX from "xlsx";
import { getApplicationsByJobId } from "@/services/job/jobService";
import Pagination, { IPaginationMeta } from "@/components/ui/custom/Pagination";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { resolveStorageUrl } from "@/lib/stoage";

interface Applicant {
  id: number;
  userId: number;
  name: string;
  email: string;
  phoneNumber?: string;
  resume?: string;
  linkedinProfile?: string;
  portfolioLink?: string;
  role?: string;
  jobId?: string;
  yearsOfExperience?: string;
  currentCTC?: string;
  expectedCTC?: string;
  noticePeriod?: string;
  openToRelocate?: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function JobApplicants() {
  const router = useRouter();
  const pathname = usePathname();
  const jobId = pathname.split("/").filter(Boolean).pop();

  const [applications, setApplications] = useState<Applicant[]>([]);
  const [meta, setMeta] = useState<IPaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!jobId) return;

    const fetchApplicants = async () => {
      setLoading(true);
      try {
        const res = await getApplicationsByJobId(jobId, { page, limit });
        setApplications(res.data);
        setMeta(res.meta);
      } catch (error) {
        console.error("Failed to fetch applicants", error);
      } finally {
        setLoading(false);
      }
    };

    fetchApplicants();
  }, [jobId, page, limit]);

  const handleViewDetails = (applicant: Applicant) => {
    setSelectedApplicant(applicant);
    setDialogOpen(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Applied-on reads as "how fresh is this?" far more often than an exact date,
  // so the row leads with the relative age and keeps the date underneath.
  const formatRelative = (dateString: string) => {
    const days = Math.floor(
      (Date.now() - new Date(dateString).getTime()) / 86400000,
    );
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  };

  const roleLabel = (role?: string) => {
    if (role === "working_professional") return "Working Professional";
    if (role === "fresher") return "Fresher";
    return "Not specified";
  };

  const roleBadgeClass = (role?: string) => {
    if (role === "working_professional")
      return "bg-purple-50 text-purple-700 ring-purple-200";
    if (role === "fresher") return "bg-blue-50 text-blue-700 ring-blue-200";
    return "bg-gray-50 text-gray-600 ring-gray-200";
  };

  const iconLinkClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900";

  const handleDownloadExcel = async () => {
    if (!jobId) return;

    try {
      setDownloading(true);

      let allApplicants: Applicant[] = [];
      let currentPage = 1;
      const downloadLimit = 100; // Using a reasonable batch size
      let hasMore = true;

      while (hasMore) {
        const { data, meta: currentMeta } = await getApplicationsByJobId(
          jobId,
          {
            page: currentPage,
            limit: downloadLimit,
          },
        );

        allApplicants = [...allApplicants, ...data];

        if (allApplicants.length >= currentMeta.total || data.length === 0) {
          hasMore = false;
        } else {
          currentPage++;
        }
      }

      const excelData = allApplicants.map((item: Applicant, index: number) => ({
        "S.No": index + 1,
        "Application ID": item.id,
        "User ID": item.userId,
        Name: item.name,
        Email: item.email,
        Phone: item.phoneNumber || "N/A",
        Role: item.role || "N/A",
        "Years of Experience": item.yearsOfExperience
          ? `${item.yearsOfExperience} yrs`
          : "N/A",
        "Current CTC": item.currentCTC || "N/A",
        "Expected CTC": item.expectedCTC || "N/A",
        "Notice Period": item.noticePeriod || "N/A",
        "Open to Relocate": item.openToRelocate ? "Yes" : "No",
        "LinkedIn Profile": item.linkedinProfile || "N/A",
        "Portfolio Link": item.portfolioLink || "N/A",
        Resume: item.resume ? resolveStorageUrl(item.resume) || "N/A" : "N/A",
        "Applied On": new Date(item.createdAt).toLocaleString(),
        "Last Updated": new Date(item.updatedAt).toLocaleString(),
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Applicants");

      const maxWidth = 50;
      const colWidths = Object.keys(excelData[0] || {}).map((key) => {
        const maxLength = Math.max(
          key.length,
          ...excelData.map((row: any) => String(row[key] || "").length),
        );
        return { wch: Math.min(maxLength + 2, maxWidth) };
      });
      worksheet["!cols"] = colWidths;

      const timestamp = new Date().toISOString().split("T")[0];
      const filename = `job_${jobId}_applicants_${timestamp}.xlsx`;

      XLSX.writeFile(workbook, filename);
    } catch (error) {
      console.error("Error downloading Excel:", error);
      alert("Failed to download Excel file");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="px-5 h-16 flex items-center gap-2 border-b border-gray-200 text-lg font-semibold flex-shrink-0">
        <ArrowLeft
          className="h-5 w-5 cursor-pointer hover:text-gray-600"
          onClick={() => router.back()}
        />
        <span>Job Applicants</span>
        {meta && meta.total > 0 && (
          <span className="ml-2 text-sm text-gray-500 font-normal">
            Total: {meta.total} applicants
          </span>
        )}
        {meta && meta.total > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadExcel}
            disabled={downloading}
            className="ml-auto inline-flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            {downloading ? "Downloading..." : "Export Excel"}
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-gray-50">
        <div className="p-5">
          {loading && (
            <div className="flex justify-center items-center h-64">
              <p className="text-gray-500">Loading applicants...</p>
            </div>
          )}

          {!loading && applications.length === 0 && (
            <div className="flex justify-center items-center h-64">
              <p className="text-gray-500">No applicants found.</p>
            </div>
          )}

          {!loading && applications.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        #
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Applicant
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Current &rarr; Expected
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Availability
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Links
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Applied
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {applications.map((applicant, index) => {
                      const resumeUrl = applicant.resume
                        ? resolveStorageUrl(applicant.resume)
                        : null;
                      const hasLinks = Boolean(
                        resumeUrl ||
                          applicant.linkedinProfile ||
                          applicant.portfolioLink,
                      );

                      return (
                        <tr
                          key={applicant.id}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-4 py-4 align-top text-sm text-gray-500">
                            {(page - 1) * limit + index + 1}
                          </td>

                          {/* Name, email and phone read as one block - three
                              separate columns of contact detail crowded out
                              everything else. */}
                          <td className="px-4 py-4 align-top">
                            <div className="text-sm font-medium text-gray-900">
                              {applicant.name}
                            </div>
                            <a
                              href={`mailto:${applicant.email}`}
                              className="text-sm text-blue-600 hover:underline break-all"
                            >
                              {applicant.email}
                            </a>
                            <div className="text-sm text-gray-500">
                              {applicant.phoneNumber ? (
                                <a
                                  href={`tel:${applicant.phoneNumber}`}
                                  className="hover:text-gray-900"
                                >
                                  {applicant.phoneNumber}
                                </a>
                              ) : (
                                <>&mdash;</>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-4 align-top whitespace-nowrap">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${roleBadgeClass(
                                applicant.role,
                              )}`}
                            >
                              {roleLabel(applicant.role)}
                            </span>
                            {applicant.yearsOfExperience && (
                              <div className="mt-1 text-sm text-gray-600">
                                {applicant.yearsOfExperience} yrs exp
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-4 align-top whitespace-nowrap text-sm">
                            {applicant.currentCTC || applicant.expectedCTC ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-600">
                                  {applicant.currentCTC || "—"}
                                </span>
                                <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
                                <span className="font-medium text-gray-900">
                                  {applicant.expectedCTC || "—"}
                                </span>
                              </div>
                            ) : (
                              <span className="text-gray-400">&mdash;</span>
                            )}
                          </td>

                          <td className="px-4 py-4 align-top whitespace-nowrap text-sm">
                            <div className="text-gray-700">
                              {applicant.noticePeriod || "—"}
                            </div>
                            {applicant.openToRelocate && (
                              <div className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
                                <MapPin className="h-3 w-3" />
                                Open to relocate
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-4 align-top">
                            {hasLinks ? (
                              <div className="flex items-center gap-1.5">
                                {resumeUrl && (
                                  <a
                                    href={resumeUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Open resume"
                                    className={iconLinkClass}
                                  >
                                    <FileText className="h-4 w-4" />
                                  </a>
                                )}
                                {applicant.linkedinProfile && (
                                  <a
                                    href={applicant.linkedinProfile}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="LinkedIn profile"
                                    className={iconLinkClass}
                                  >
                                    <Linkedin className="h-4 w-4" />
                                  </a>
                                )}
                                {applicant.portfolioLink && (
                                  <a
                                    href={applicant.portfolioLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Portfolio"
                                    className={iconLinkClass}
                                  >
                                    <Link2 className="h-4 w-4" />
                                  </a>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400">&mdash;</span>
                            )}
                          </td>

                          <td className="px-4 py-4 align-top whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {formatRelative(applicant.createdAt)}
                            </div>
                            <div className="text-xs text-gray-500">
                              {new Date(applicant.createdAt).toLocaleDateString()}
                            </div>
                          </td>

                          <td className="px-4 py-4 align-top text-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewDetails(applicant)}
                              className="inline-flex items-center gap-1"
                            >
                              <Eye className="h-4 w-4" />
                              View
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {meta && meta.total > 0 && (
        <div className="border-t border-gray-200 flex-shrink-0 pb-4">
          <Pagination
            meta={meta}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        </div>
      )}

      {/* Applicant Details Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="min-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              Applicant Details
            </DialogTitle>
          </DialogHeader>

          {selectedApplicant && (
            <div className="space-y-6 mt-4">
              {/* Personal Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">
                  Personal Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Full Name
                    </label>
                    <p className="mt-1 text-base text-gray-900">
                      {selectedApplicant.name}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      User ID
                    </label>
                    <p className="mt-1 text-base text-gray-900">
                      {selectedApplicant.userId}
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <label className="text-sm font-medium text-gray-500">
                        Email
                      </label>
                      <p className="mt-1 text-base text-gray-900 break-all">
                        {selectedApplicant.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <label className="text-sm font-medium text-gray-500">
                        Phone Number
                      </label>
                      <p className="mt-1 text-base text-gray-900">
                        {selectedApplicant.phoneNumber || "Not provided"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Professional Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">
                  Professional Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-2">
                    <Briefcase className="h-5 w-5 text-gray-400 mt-0.5" />
                    <div className="flex-1">
                      <label className="text-sm font-medium text-gray-500">
                        Role
                      </label>
                      <p className="mt-1 text-base text-gray-900 capitalize">
                        {selectedApplicant.role || "Not specified"}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Years of Experience
                    </label>
                    <p className="mt-1 text-base text-gray-900">
                      {selectedApplicant.yearsOfExperience
                        ? `${selectedApplicant.yearsOfExperience} years`
                        : "Not specified"}
                    </p>
                  </div>
                </div>

                {/* LinkedIn Profile */}
                {selectedApplicant.linkedinProfile && (
                  <div className="flex items-start gap-2">
                    <Linkedin className="h-5 w-5 mt-0.5" />
                    <div className="flex-1">
                      <label className="text-sm font-medium text-gray-500">
                        LinkedIn Profile
                      </label>
                      <a
                        href={selectedApplicant.linkedinProfile}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 text-base text-blue-600 hover:underline flex items-center gap-1 break-all"
                      >
                        {selectedApplicant.linkedinProfile}
                        <ExternalLink className="h-4 w-4 flex-shrink-0" />
                      </a>
                    </div>
                  </div>
                )}

                {/* Portfolio Link */}
                {selectedApplicant.portfolioLink && (
                  <div className="flex items-start gap-2">
                    <Link2 className="h-5 w-5 mt-0.5" />
                    <div className="flex-1">
                      <label className="text-sm font-medium text-gray-500">
                        Portfolio Link
                      </label>
                      <a
                        href={selectedApplicant.portfolioLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 text-base text-blue-600 hover:underline flex items-center gap-1 break-all"
                      >
                        {selectedApplicant.portfolioLink}
                        <ExternalLink className="h-4 w-4 flex-shrink-0" />
                      </a>
                    </div>
                  </div>
                )}

                {/* Resume */}
                {selectedApplicant.resume && (
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-medium text-gray-500">
                      Resume
                    </label>
                    <Button
                      onClick={() => {
                        const url = resolveStorageUrl(selectedApplicant.resume);
                        if (url) window.open(url, "_blank");
                      }}
                      className="mt-2 inline-flex items-center gap-2"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View Resume
                    </Button>
                  </div>
                )}
              </div>

              {/* Compensation & Availability */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">
                  Compensation & Availability
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Current CTC
                    </label>
                    <p className="mt-1 text-base text-gray-900">
                      {selectedApplicant.currentCTC || "Not specified"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Expected CTC
                    </label>
                    <p className="mt-1 text-base text-gray-900">
                      {selectedApplicant.expectedCTC || "Not specified"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Notice Period
                    </label>
                    <p className="mt-1 text-base text-gray-900">
                      {selectedApplicant.noticePeriod || "Not specified"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Open to Relocate
                    </label>
                    <p className="mt-1 text-base text-gray-900">
                      {selectedApplicant.openToRelocate ? "Yes" : "No"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Application Timeline */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">
                  Application Timeline
                </h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                    <div className="flex-1">
                      <label className="text-sm font-medium text-gray-500">
                        Applied On
                      </label>
                      <p className="mt-1 text-base text-gray-900">
                        {formatDate(selectedApplicant.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
                    <div className="flex-1">
                      <label className="text-sm font-medium text-gray-500">
                        Last Updated
                      </label>
                      <p className="mt-1 text-base text-gray-900">
                        {formatDate(selectedApplicant.updatedAt)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Additional Info */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Application ID:</span>{" "}
                  {selectedApplicant.id}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-medium">Job ID:</span>{" "}
                  {selectedApplicant.jobId || "N/A"}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

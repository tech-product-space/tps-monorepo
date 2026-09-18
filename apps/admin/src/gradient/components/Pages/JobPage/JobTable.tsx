"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import { Badge } from "@/gradient/components/ui/badge";
import { Job } from "@/gradient/types/job";
import { Eye, Trash2, Pencil } from "lucide-react";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/gradient/components/ui/tooltip";

interface JobTableProps {
  jobs: Job[];
  isLoading: boolean;
  onDelete: (id: string) => void;
}

export default function JobTable({ jobs, isLoading, onDelete }: JobTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
          <p className="text-sm text-gray-500">Loading jobs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job Title</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Level</TableHead>
            <TableHead>Posted At</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {jobs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center">
                No jobs found.
              </TableCell>
            </TableRow>
          ) : (
            jobs.map((job) => (
              <TableRow key={job.id}>
                {/* Title with truncation + tooltip */}
                <TableCell className="font-medium h-14">
                  <span title={job.title} className="cursor-pointer">
                    {job.title?.split(" ").slice(0, 3).join(" ")}
                    {job.title?.split(" ").length > 3 && "..."}
                  </span>
                </TableCell>

                {/* Company */}
                <TableCell>
                  <div className="flex items-center gap-2">
                    {job.companyLogo && (
                      <img
                        src={job.companyLogo}
                        alt={job.companyName}
                        className="h-6 w-6 rounded-full object-contain"
                      />
                    )}
                    {job.companyName}
                  </div>
                </TableCell>

                {/* Employment Type */}
                <TableCell>
                  <Badge variant="secondary">{job.employmentType}</Badge>
                </TableCell>

                {/* Seniority */}
                <TableCell>{job.seniorityLevel}</TableCell>

                {/* Date */}
                <TableCell>
                  {job.postedAt
                    ? new Date(job.postedAt).toLocaleDateString()
                    : "N/A"}
                </TableCell>

                {/* Actions */}
                <TableCell>
                  <div className="flex items-center gap-3">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            href={`/jobs/edit/${job.id}`}
                            className="text-gray-600 hover:text-gray-800 transition"
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent>Edit Job</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            href={`/jobs/view-applications/${job.id}`}
                            className="text-gray-600 hover:text-gray-800 transition"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent>View Applications</TooltipContent>
                      </Tooltip>

                      {/* Delete */}
                      {job.jobSource === "EXTERNAL" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => onDelete(job.id)}
                              className="text-red-600 hover:text-red-800 transition"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Delete Job</TooltipContent>
                        </Tooltip>
                      )}
                    </TooltipProvider>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

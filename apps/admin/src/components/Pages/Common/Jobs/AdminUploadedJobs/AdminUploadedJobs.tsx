"use client";

import { getJobsUploadedByAdmin } from "@/services/job/jobService";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import Cookies from "js-cookie";

interface Job {
  id: string;
  title: string;
  location: string;
  companyName: string;
  companyLogo: string | null;
  employmentType: string | null;
  seniorityLevel: string | null;
  jobFunction: string | null;
  createdAt: string;
}

export default function AdminUploadedJobs() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const role = Cookies.get("currentRole");

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const res = await getJobsUploadedByAdmin({});
        setJobs(res.data ?? []);
      } catch (err) {
        console.error("Failed to fetch admin jobs", err);
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();
  }, []);

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="px-5 h-16 flex items-center gap-2 border-b border-gray-200 text-lg font-semibold shrink-0">
        <ArrowLeft
          className="h-5 w-5 cursor-pointer"
          onClick={() => router.back()}
        />
        <span>Jobs Added By Product Space</span>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 bg-gray-50">
        {loading && <p className="text-gray-500">Loading jobs...</p>}

        {!loading && jobs.length === 0 && (
          <p className="text-gray-500">No admin-uploaded jobs found.</p>
        )}

        {!loading &&
          jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center gap-4 border border-gray-200 shadow-md rounded-lg p-4 hover:shadow-sm transition bg-white"
            >
              {/* Logo */}
              {job.companyLogo && (
                <img
                  src={job.companyLogo}
                  alt={job.companyName}
                  className="w-12 h-12 object-contain rounded"
                />
              )}

              {/* Job Info */}
              <div className="flex-1">
                <h3 className="font-semibold text-base">{job.title}</h3>
                <p className="text-sm text-gray-600">{job.companyName}</p>
                <p className="text-sm text-gray-500">{job.location}</p>

                <div className="flex gap-3 text-xs text-gray-500 mt-2">
                  {job.employmentType && <span>{job.employmentType}</span>}
                  {job.seniorityLevel && <span>{job.seniorityLevel}</span>}
                  {job.jobFunction && <span>{job.jobFunction}</span>}
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={() =>
                  router.push(`/${role}/jobs/admin-uploaded-jobs/${job.id}`)
                }
                className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-md hover:bg-gray-100 transition"
              >
                View Applications
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}

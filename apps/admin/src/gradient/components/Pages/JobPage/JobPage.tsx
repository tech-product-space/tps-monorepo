"use client";

import { useEffect, useState } from "react";
import { jobService } from "@/gradient/services/jobService";
import JobTable from "./JobTable";

import { Job, JobResponse } from "@/gradient/types/job";
import Pagination from "@/gradient/components/ui/custom/Pagination";
import { IPaginationMeta } from "@/gradient/types/pagination";

interface JobPageProps {
  search: string; // ✅ ADD
}

export default function JobPage({ search }: JobPageProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(9);

  const [debouncedSearch, setDebouncedSearch] = useState<string>("");

  const [meta, setMeta] = useState<IPaginationMeta>({
    total: 0,
    page: 1,
    limit: 9,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  // ✅ debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // reset page on new search
    }, 500);

    return () => clearTimeout(timer);
  }, [search]);

  const fetchJobs = async () => {
    try {
      setIsLoading(true);

      const res: JobResponse = await jobService.getAllJobs({
        page,
        limit,
        search: debouncedSearch,
      });

      setJobs(res.data);
      setMeta(res.meta);
    } catch (error) {
      console.error("Error fetching jobs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmDelete = confirm("Are you sure you want to delete this job?");
    if (!confirmDelete) return;

    try {
      await jobService.deleteJob(id);

      // optimistic update
      setJobs((prev) => prev.filter((job) => job.id !== id));
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [page, limit, debouncedSearch]);

  return (
    <div className="bg-white rounded-md border">
      <JobTable
        jobs={jobs}
        isLoading={isLoading}
        onDelete={handleDelete}
      />

      <Pagination
        meta={meta}
        onPageChange={setPage}
        onLimitChange={setLimit}
      />
    </div>
  );
}
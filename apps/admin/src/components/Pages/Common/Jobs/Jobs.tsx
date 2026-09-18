"use client";
import { useEffect, useMemo, useState } from "react";
import { getJobs } from "@/services/job/jobService";
import JobsTable from "./JobsTable/JobsTable";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import Pagination from "@/components/ui/custom/Pagination";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { debounce } from "@/utils/debounce";
import Cookies from "js-cookie";

export interface Job {
  id: string;
  title: string;
  location: string;
  employmentType: string;
  seniorityLevel: string;
  jobFunction: string;
  companyName: string;
  companyLogo: string;
  descriptionText: string;
  link: string;
  descriptionHtml: string;
  uploadedBy: string;
  status: string;
  jobSource: string;
  postedAt: string;
  repostedAt: string | null;
  repostCount: number;
}

const ALL = "all";

const Jobs = () => {
  const router = useRouter();
  const role = Cookies.get("currentRole");
  
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [meta, setMeta] = useState({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [sourceFilter, setSourceFilter] = useState<string>(ALL);

  const fetchJobs = async (
    page = 1,
    limit = 20,
    search = searchTerm,
    status = statusFilter,
    jobSource = sourceFilter,
    silent = false
  ) => {
    try {
      // Silent refreshes (e.g. after a status change) update the rows in place
      // without flashing the full-table loader.
      if (!silent) setIsLoading(true);
      const res = await getJobs({
        page,
        limit,
        search,
        status: status === ALL ? undefined : status,
        jobSource: jobSource === ALL ? undefined : jobSource,
      });
      setJobs(res.data);
      setMeta(res.meta);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs(meta.page, meta.limit);
  }, []);

  const debouncedSearch = useMemo(
    () =>
      debounce((value: string) => {
        fetchJobs(1, meta.limit, value);
      }, 400),
    [meta.limit, statusFilter, sourceFilter]
  );

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    fetchJobs(1, meta.limit, searchTerm, value, sourceFilter);
  };

  const handleSourceFilterChange = (value: string) => {
    setSourceFilter(value);
    fetchJobs(1, meta.limit, searchTerm, statusFilter, value);
  };

  const refreshJobs = () =>
    fetchJobs(meta.page, meta.limit, searchTerm, statusFilter, sourceFilter, true);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    debouncedSearch(value);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    debouncedSearch("");
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="px-5 h-16 flex justify-between items-center border-b">
        <div className="flex items-center gap-2">
          <SidebarTrigger size={"lg"} />
          <p className="text-lg font-semibold">Jobs</p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            className="px-4 py-2 text-sm font-medium cursor-pointer flex items-center gap-2"
            onClick={() => router.push(`/${role}/jobs/admin-uploaded-jobs`)}
          >
            Job Applications
          </Button>
          <Button
            className="px-4 py-2 text-sm font-medium cursor-pointer flex items-center gap-2"
            onClick={() => router.push(`/${role}/jobs/add`)}
          >
            <Plus />
            Add Job
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 bg-gray-50 overflow-auto p-5">
        {/* Search + filters toolbar */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {/* Search Input */}
          <div className="relative w-64 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search by JobId..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="pl-9 pr-9 w-full bg-white border-gray-200 transition-colors"
            />
            {searchTerm && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Source filter */}
          <Select value={sourceFilter} onValueChange={handleSourceFilterChange}>
            <SelectTrigger className="w-36 bg-white">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="external">External</SelectItem>
              <SelectItem value="career">Career</SelectItem>
            </SelectContent>
          </Select>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
            <SelectTrigger className="w-36 bg-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg shadow">
          {isLoading ? (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
            </div>
          ) : (
            <JobsTable mockJobs={jobs} onRefresh={refreshJobs} />
          )}
        </div>
      </div>

      {/* Pagination */}
      <div className="p-4">
        <Pagination
          meta={meta}
          onPageChange={(newPage) => fetchJobs(newPage, meta.limit)}
          onLimitChange={(newLimit) => fetchJobs(1, newLimit)}
        />
      </div>
    </div>
  );
};

export default Jobs;

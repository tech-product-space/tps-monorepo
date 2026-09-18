"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useProjectStore } from "@/gradient/lib/store/useProjectStore";
import { projectService } from "@/gradient/services/projectService";
import { Project, ProjectCategory } from "@/gradient/types/project";
import { IPaginationMeta } from "@/gradient/types/pagination";

import AddProject from "./AddProject";
import ProjectTable from "./ProjectTable";
import ProjectFilters, {
  ANY,
  DEFAULT_FILTERS,
  ProjectFilterState,
} from "./ProjectFilters";

const EMPTY_META: IPaginationMeta = {
  total: 0,
  page: 1,
  limit: 10,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

/** `ANY` is the Radix-safe stand-in for "no filter"; the API wants it gone. */
const strip = (value: string) => (value === ANY ? undefined : value);

export default function ProjectPage() {
  const { showCreateForm, setShowCreateForm } = useProjectStore();

  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<ProjectCategory[]>([]);
  const [fetchLoading, setFetchLoading] = useState(true);

  const [filters, setFilters] = useState<ProjectFilterState>(DEFAULT_FILTERS);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [meta, setMeta] = useState<IPaginationMeta>(EMPTY_META);

  /**
   * Only the search box is debounced. A select fires once per deliberate click,
   * so delaying it would just make the panel feel slow.
   */
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(filters.q.trim()), 400);
    return () => clearTimeout(timer);
  }, [filters.q]);

  /**
   * Any narrowing sends you back to page one — otherwise filtering while on
   * page 4 of 6 can land on a page that no longer exists, and the table reads
   * as "no projects" for a filter that matched plenty.
   */
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setPage(1);
  }, [
    debouncedQ,
    filters.categoryId,
    filters.level,
    filters.status,
    filters.source,
    filters.isPublished,
    filters.sort,
    limit,
  ]);

  const fetchProjects = useCallback(async () => {
    setFetchLoading(true);
    try {
      const data = await projectService.getAllProjects({
        page,
        limit,
        q: debouncedQ || undefined,
        categoryId: strip(filters.categoryId),
        level: strip(filters.level) as any,
        status: strip(filters.status) as any,
        source: strip(filters.source) as any,
        isPublished:
          filters.isPublished === ANY
            ? undefined
            : filters.isPublished === "true",
        sort: filters.sort,
      });

      if (data.success) {
        setProjects(data.data);
        setMeta(data.meta ?? EMPTY_META);
      } else {
        toast.error(data.message || "Failed to fetch projects");
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Error fetching projects");
    } finally {
      setFetchLoading(false);
    }
  }, [
    page,
    limit,
    debouncedQ,
    filters.categoryId,
    filters.level,
    filters.status,
    filters.source,
    filters.isPublished,
    filters.sort,
  ]);

  // Loaded here rather than inside the create form and the filter bar
  // separately — both need the list, and two components fetching the same rows
  // on every render of this page is noise.
  const fetchCategories = useCallback(async () => {
    try {
      const data = await projectService.getCategories();
      if (data.success) setCategories(data.data);
    } catch {
      // Non-fatal: the list still renders, the category column shows "—".
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  /**
   * Deleting the last row of a page leaves you staring at an empty table with
   * pages either side of it, so step back one instead of refetching nothing.
   */
  const afterDelete = useCallback(() => {
    if (projects.length === 1 && page > 1) setPage((p) => p - 1);
    else fetchProjects();
  }, [projects.length, page, fetchProjects]);

  return (
    <div className="space-y-8">
      {showCreateForm && (
        <AddProject
          categories={categories}
          onSuccess={() => {
            setShowCreateForm(false);
            fetchProjects();
          }}
        />
      )}

      <ProjectTable
        projects={projects}
        fetchProjects={fetchProjects}
        onDeleted={afterDelete}
        fetchLoading={fetchLoading}
        meta={meta}
        onPageChange={setPage}
        onLimitChange={setLimit}
        hasFilters={
          Boolean(debouncedQ) ||
          filters.categoryId !== ANY ||
          filters.level !== ANY ||
          filters.status !== ANY ||
          filters.source !== ANY ||
          filters.isPublished !== ANY
        }
        filterBar={
          <ProjectFilters
            filters={filters}
            onChange={(next) => setFilters((prev) => ({ ...prev, ...next }))}
            categories={categories}
            total={meta.total}
            loading={fetchLoading}
          />
        }
      />
    </div>
  );
}

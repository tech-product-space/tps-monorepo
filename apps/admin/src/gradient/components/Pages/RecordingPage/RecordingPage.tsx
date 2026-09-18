"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useRecordingStore } from "@/gradient/lib/store/useRecordingStore";
import { recordingService } from "@/gradient/services/recordingService";
import { RecordingCategory, RecordingResponse } from "@/gradient/types/recording";
import { IPaginationMeta } from "@/gradient/types/pagination";

import AddRecording from "./AddRecording/AddRecording";
import RecordingTable from "./RecordingTable";
import RecordingFilters, {
  ANY,
  DEFAULT_FILTERS,
  RecordingFilterState,
} from "./RecordingFilters";

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

export default function RecordingPage() {
  const { showCreateForm } = useRecordingStore();

  const [recordings, setRecordings] = useState<RecordingResponse[]>([]);
  const [categories, setCategories] = useState<RecordingCategory[]>([]);
  const [fetchLoading, setFetchLoading] = useState(true);

  const [filters, setFilters] = useState<RecordingFilterState>(DEFAULT_FILTERS);
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
   * Any narrowing sends you back to page one.
   *
   * Without it, filtering while on page 4 of 6 can land on a page that no
   * longer exists, and the table reads as "no recordings" for a filter that
   * matched plenty.
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
    filters.isPublished,
    filters.format,
    filters.sort,
    limit,
  ]);

  const fetchRecordings = useCallback(async () => {
    setFetchLoading(true);
    try {
      const data = await recordingService.getAllRecordings({
        page,
        limit,
        q: debouncedQ || undefined,
        categoryId: strip(filters.categoryId),
        isPublished:
          filters.isPublished === ANY
            ? undefined
            : filters.isPublished === "true",
        format: strip(filters.format),
        sort: filters.sort,
      });

      if (data.success) {
        setRecordings(data.data);
        setMeta(data.meta ?? EMPTY_META);
      } else {
        toast.error(data.message || "Failed to fetch recordings");
      }
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Error fetching recordings",
      );
    } finally {
      setFetchLoading(false);
    }
  }, [
    page,
    limit,
    debouncedQ,
    filters.categoryId,
    filters.isPublished,
    filters.format,
    filters.sort,
  ]);

  // Loaded here rather than inside the create form, the filter bar and the
  // table separately — all three need the chip list, and three components
  // fetching the same seven rows on every render of this page is noise.
  const fetchCategories = useCallback(async () => {
    try {
      const data = await recordingService.getCategories();
      if (data.success) setCategories(data.data);
    } catch {
      // Non-fatal: the list still renders, the category column just shows "—".
    }
  }, []);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  /**
   * Deleting the last row of a page leaves you staring at an empty table with
   * pages either side of it, so step back one instead of refetching nothing.
   */
  const afterDelete = useCallback(() => {
    if (recordings.length === 1 && page > 1) setPage((p) => p - 1);
    else fetchRecordings();
  }, [recordings.length, page, fetchRecordings]);

  return (
    <div className="space-y-8">
      {showCreateForm && (
        <AddRecording categories={categories} onSuccess={fetchRecordings} />
      )}

      <RecordingTable
        recordings={recordings}
        fetchRecordings={fetchRecordings}
        onDeleted={afterDelete}
        fetchLoading={fetchLoading}
        meta={meta}
        onPageChange={setPage}
        onLimitChange={setLimit}
        hasFilters={
          Boolean(debouncedQ) ||
          filters.categoryId !== ANY ||
          filters.isPublished !== ANY ||
          filters.format !== ANY
        }
        filterBar={
          <RecordingFilters
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

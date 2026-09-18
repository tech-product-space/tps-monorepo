"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Tags } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Pagination from "@/components/ui/custom/Pagination";

import { useNotification } from "@/helpers/NotificationContext";
import { useAutomationBasePath } from "@/hooks/useAutomationBasePath";
import {
  getAllRecordings,
  getRecordingCategories,
} from "@/services/recordings/recordingsService";
import { IPaginationMeta } from "@/types/pagination";
import { RecordingCategory, RecordingResponse } from "@/types/recording";

import AddRecordingDialog from "./AddRecordingDialog";
import RecordingFilters, { ANY, RecordingFilterState } from "./RecordingFilters";
import RecordingTable from "./RecordingTable";

const EMPTY_FILTERS: RecordingFilterState = {
  q: "",
  categoryId: ANY,
  format: ANY,
  status: ANY,
  sort: "recent",
};

export default function RecordingsPage() {
  const router = useRouter();
  const basePath = useAutomationBasePath();
  const { showNotification } = useNotification();

  const [recordings, setRecordings] = useState<RecordingResponse[]>([]);
  const [categories, setCategories] = useState<RecordingCategory[]>([]);
  const [meta, setMeta] = useState<IPaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState<RecordingFilterState>(EMPTY_FILTERS);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [addOpen, setAddOpen] = useState(false);

  // The search box is debounced; the selects are not. Each of those fires once
  // per deliberate click, so delaying them only makes the panel feel slow.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(filters.q), 400);
    return () => clearTimeout(timer);
  }, [filters.q]);

  const fetchRecordings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getAllRecordings({
        page,
        limit,
        q: debouncedQ || undefined,
        categoryId:
          filters.categoryId === ANY ? undefined : filters.categoryId,
        format: filters.format === ANY ? undefined : filters.format,
        isPublished:
          filters.status === ANY ? undefined : filters.status === "true",
        sort: filters.sort,
      });

      setRecordings(response.data ?? []);
      setMeta(response.meta ?? null);
    } catch (error: any) {
      showNotification(
        "error",
        error?.response?.data?.message || "Could not load recordings"
      );
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    page,
    limit,
    debouncedQ,
    filters.categoryId,
    filters.format,
    filters.status,
    filters.sort,
  ]);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  const loadCategories = useCallback(async () => {
    try {
      const response = await getRecordingCategories();
      setCategories(response.data ?? []);
    } catch {
      // The filter bar degrades to "all categories"; the page still works.
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  /**
   * Any narrowing resets to page 1.
   *
   * Filtering while on page 4 of 6 otherwise lands on a page that no longer
   * exists, and the table reads "no recordings" for a filter that matched
   * plenty.
   */
  const handleFilters = (next: RecordingFilterState) => {
    setFilters(next);
    setPage(1);
  };

  const isFiltered =
    Boolean(debouncedQ) ||
    filters.categoryId !== ANY ||
    filters.format !== ANY ||
    filters.status !== ANY;

  return (
    <div className="flex h-screen flex-col bg-white">
      <div className="flex h-16 items-center justify-between border-b border-gray-200 px-5">
        <p className="text-lg font-semibold text-gray-900">Recordings</p>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.push(`${basePath}/recordings/categories`)}
          >
            <Tags className="mr-2 h-4 w-4" />
            Categories
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Recording
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50 p-5 pb-10">
        <RecordingFilters
          value={filters}
          categories={categories}
          onChange={handleFilters}
        />

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <RecordingTable
            recordings={recordings}
            filtered={isFiltered}
            onRefresh={() => {
              // Deleting the last row of a page would otherwise land on a page
              // that no longer exists.
              if (recordings.length === 1 && page > 1) setPage(page - 1);
              else fetchRecordings();
            }}
          />
        )}

        {meta && meta.totalPages > 1 && (
          <div className="mt-4">
            <Pagination
              meta={meta}
              onPageChange={setPage}
              onLimitChange={(next) => {
                setLimit(next);
                setPage(1);
              }}
            />
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New recording</DialogTitle>
          </DialogHeader>
          <AddRecordingDialog
            categories={categories}
            onCreated={fetchRecordings}
            onClose={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

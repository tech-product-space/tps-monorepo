"use client";

import { Search, X } from "lucide-react";

import { Input } from "@/gradient/components/ui/input";
import { Button } from "@/gradient/components/ui/button";
import { Badge } from "@/gradient/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";

import { RecordingCategory } from "@/gradient/types/recording";
import { RECORDING_FORMATS } from "@/gradient/constants/recording";

/**
 * Radix Select cannot hold an empty string as a value — it reserves "" for
 * "nothing selected" and throws. So "no filter" is a sentinel the page strips
 * before it reaches the query string.
 */
export const ANY = "any";

export interface RecordingFilterState {
  q: string;
  categoryId: string;
  isPublished: string;
  format: string;
  sort: string;
}

export const DEFAULT_FILTERS: RecordingFilterState = {
  q: "",
  categoryId: ANY,
  isPublished: ANY,
  format: ANY,
  sort: "recent",
};

const SORTS = [
  { value: "recent", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "title", label: "Title A–Z" },
  { value: "views", label: "Most viewed" },
  { value: "longest", label: "Longest first" },
];

interface Props {
  filters: RecordingFilterState;
  onChange: (next: Partial<RecordingFilterState>) => void;
  categories: RecordingCategory[];
  total: number;
  loading: boolean;
}

/** Everything except `sort` — reordering a list is not narrowing it. */
export const countActiveFilters = (filters: RecordingFilterState) =>
  [
    filters.q.trim() ? 1 : 0,
    filters.categoryId !== ANY ? 1 : 0,
    filters.isPublished !== ANY ? 1 : 0,
    filters.format !== ANY ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

export default function RecordingFilters({
  filters,
  onChange,
  categories,
  total,
  loading,
}: Props) {
  const active = countActiveFilters(filters);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.q}
            onChange={(e) => onChange({ q: e.target.value })}
            placeholder="Search title, subtitle or slug"
            className="pl-9"
          />
          {filters.q && (
            <button
              type="button"
              onClick={() => onChange({ q: "" })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Select
          value={filters.categoryId}
          onValueChange={(v) => onChange({ categoryId: v })}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>All categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.isPublished}
          onValueChange={(v) => onChange({ isPublished: v })}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any status</SelectItem>
            <SelectItem value="true">Published</SelectItem>
            <SelectItem value="false">Draft</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.format}
          onValueChange={(v) => onChange({ format: v })}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any format</SelectItem>
            {RECORDING_FORMATS.map((format) => (
              <SelectItem key={format} value={format}>
                {format}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.sort} onValueChange={(v) => onChange({ sort: v })}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((sort) => (
              <SelectItem key={sort.value} value={sort.value}>
                {sort.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {loading ? (
          <span>Searching…</span>
        ) : (
          <span>
            {total} recording{total === 1 ? "" : "s"}
            {active > 0 && " matching"}
          </span>
        )}

        {active > 0 && (
          <>
            <Badge variant="secondary">
              {active} filter{active === 1 ? "" : "s"}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(DEFAULT_FILTERS)}
            >
              Clear
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

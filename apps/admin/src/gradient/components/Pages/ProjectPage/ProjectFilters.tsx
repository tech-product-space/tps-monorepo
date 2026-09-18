"use client";

import { Search } from "lucide-react";

import { Input } from "@/gradient/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";
import {
  PROJECT_LEVELS,
  PROJECT_LEVEL_LABELS,
  ProjectCategory,
} from "@/gradient/types/project";

/**
 * Radix refuses an empty-string `SelectItem` value, so "no filter" needs a
 * sentinel. Stripped before the request — the API treats an absent param as
 * "all", and sending the literal "__any" would filter on a level nothing has.
 */
export const ANY = "__any";

export interface ProjectFilterState {
  q: string;
  categoryId: string;
  level: string;
  status: string;
  source: string;
  isPublished: string;
  sort: string;
}

export const DEFAULT_FILTERS: ProjectFilterState = {
  q: "",
  categoryId: ANY,
  level: ANY,
  status: ANY,
  source: ANY,
  isPublished: ANY,
  sort: "recent",
};

interface Props {
  filters: ProjectFilterState;
  onChange: (next: Partial<ProjectFilterState>) => void;
  categories: ProjectCategory[];
  total: number;
  loading: boolean;
}

export default function ProjectFilters({
  filters,
  onChange,
  categories,
  total,
  loading,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[220px] flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.q}
          onChange={(e) => onChange({ q: e.target.value })}
          placeholder="Search projects…"
          className="pl-9"
        />
      </div>

      <Select
        value={filters.categoryId}
        onValueChange={(categoryId) => onChange({ categoryId })}
      >
        <SelectTrigger className="w-[170px]">
          <SelectValue placeholder="Category" />
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

      <Select value={filters.level} onValueChange={(level) => onChange({ level })}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Level" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>All levels</SelectItem>
          {PROJECT_LEVELS.map((level) => (
            <SelectItem key={level} value={level}>
              {PROJECT_LEVEL_LABELS[level]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.source}
        onValueChange={(source) => onChange({ source })}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Source" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any source</SelectItem>
          <SelectItem value="admin">Created here</SelectItem>
          <SelectItem value="community">Community</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.status}
        onValueChange={(status) => onChange({ status })}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any status</SelectItem>
          <SelectItem value="submitted">Awaiting review</SelectItem>
          <SelectItem value="approved">Approved</SelectItem>
          <SelectItem value="rejected">Rejected</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.isPublished}
        onValueChange={(isPublished) => onChange({ isPublished })}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Visibility" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>All</SelectItem>
          <SelectItem value="true">Published</SelectItem>
          <SelectItem value="false">Draft</SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.sort} onValueChange={(sort) => onChange({ sort })}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Sort" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="recent">Most recent</SelectItem>
          <SelectItem value="oldest">Oldest</SelectItem>
          <SelectItem value="title">Title A–Z</SelectItem>
        </SelectContent>
      </Select>

      <span className="ml-auto text-sm text-muted-foreground">
        {loading ? "Loading…" : `${total} project${total === 1 ? "" : "s"}`}
      </span>
    </div>
  );
}

"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

import { RECORDING_FORMATS, RECORDING_SORTS } from "@/utils/recording";
import { RecordingCategory } from "@/types/recording";

/**
 * "Any", as a value the Select can hold — Radix throws on an empty-string item,
 * so "no filter" needs a sentinel of its own.
 */
export const ANY = "any";

export interface RecordingFilterState {
  q: string;
  categoryId: string;
  format: string;
  status: string;
  sort: string;
}

interface Props {
  value: RecordingFilterState;
  categories: RecordingCategory[];
  onChange: (next: RecordingFilterState) => void;
}

export default function RecordingFilters({
  value,
  categories,
  onChange,
}: Props) {
  const set = (patch: Partial<RecordingFilterState>) =>
    onChange({ ...value, ...patch });

  const filtered =
    value.q ||
    value.categoryId !== ANY ||
    value.format !== ANY ||
    value.status !== ANY;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="relative min-w-[240px] flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Search title, subtitle or slug"
          value={value.q}
          onChange={(e) => set({ q: e.target.value })}
        />
      </div>

      <Select
        value={value.categoryId}
        onValueChange={(v) => set({ categoryId: v })}
      >
        <SelectTrigger className="w-[190px]">
          <SelectValue placeholder="All categories" />
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

      <Select value={value.format} onValueChange={(v) => set({ format: v })}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="All formats" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>All formats</SelectItem>
          {RECORDING_FORMATS.map((format) => (
            <SelectItem key={format} value={format}>
              {format}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={value.status} onValueChange={(v) => set({ status: v })}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Any status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any status</SelectItem>
          <SelectItem value="true">Published</SelectItem>
          <SelectItem value="false">Draft</SelectItem>
        </SelectContent>
      </Select>

      <Select value={value.sort} onValueChange={(v) => set({ sort: v })}>
        <SelectTrigger className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RECORDING_SORTS.map((sort) => (
            <SelectItem key={sort.value} value={sort.value}>
              {sort.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {filtered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange({
              q: "",
              categoryId: ANY,
              format: ANY,
              status: ANY,
              sort: value.sort,
            })
          }
        >
          Clear
        </Button>
      )}
    </div>
  );
}

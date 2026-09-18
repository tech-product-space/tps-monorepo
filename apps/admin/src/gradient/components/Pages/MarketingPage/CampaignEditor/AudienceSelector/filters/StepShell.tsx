"use client";

import { useState, type ReactNode } from "react";
import { Loader2, Search } from "lucide-react";

import { Checkbox } from "@/gradient/components/ui/checkbox";
import { Input } from "@/gradient/components/ui/input";

interface Props<T> {
  items: T[];
  loading?: boolean;
  selectedCount: number;
  /** Everything the search box matches against for one row. */
  searchText: (item: T) => string;
  isSelected: (item: T) => boolean;
  keyOf: (item: T) => string;
  render: (item: T, selected: boolean) => ReactNode;
  placeholder: string;
  emptyLabel: string;
  noun: string;
}

/**
 * The shell every drill-down picker shares: search, a selected-only toggle, the
 * scrolling list, and a count along the bottom.
 *
 * Written once because the three pickers differ only in what a row looks like,
 * and three copies of a search box is how they end up behaving differently.
 */
export default function StepShell<T>({
  items,
  loading,
  selectedCount,
  searchText,
  isSelected,
  keyOf,
  render,
  placeholder,
  emptyLabel,
  noun,
}: Props<T>) {
  const [search, setSearch] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);

  // A snapshot from when the step opened. Sorting by the *live* selection
  // makes rows leap to the top as they are ticked, so the next click lands on
  // whatever slid into that spot.
  const [initiallySelected] = useState(
    () => new Set(items.filter(isSelected).map(keyOf)),
  );

  const query = search.trim().toLowerCase();

  const visible = items
    .filter((item) => {
      if (query && !searchText(item).toLowerCase().includes(query)) return false;
      if (selectedOnly && !isSelected(item)) return false;
      return true;
    })
    .sort((a, b) => {
      const aFirst = initiallySelected.has(keyOf(a));
      const bFirst = initiallySelected.has(keyOf(b));
      return aFirst === bFirst ? 0 : aFirst ? -1 : 1;
    });

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder}
          className="h-9 pl-9 text-sm"
        />
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-xs">
        <Checkbox
          checked={selectedOnly}
          onCheckedChange={(v) => setSelectedOnly(Boolean(v))}
        />
        Show selected only
      </label>

      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {loading && (
          <div className="text-muted-foreground flex flex-col items-center gap-2 py-16">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-xs">Loading…</span>
          </div>
        )}

        {!loading && !visible.length && (
          <div className="text-muted-foreground flex flex-col items-center py-16">
            <Search className="mb-2 h-7 w-7 opacity-30" />
            <span className="text-sm">{emptyLabel}</span>
          </div>
        )}

        {!loading &&
          visible.map((item) => (
            <div key={keyOf(item)}>{render(item, isSelected(item))}</div>
          ))}
      </div>

      <div className="text-muted-foreground border-t pt-2.5 text-xs">
        <span className="text-foreground font-medium">{selectedCount}</span>{" "}
        {noun}
        {selectedCount === 1 ? "" : "s"} selected
      </div>
    </div>
  );
}

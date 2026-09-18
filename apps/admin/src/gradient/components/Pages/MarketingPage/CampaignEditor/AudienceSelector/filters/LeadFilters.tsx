"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Checkbox } from "@/gradient/components/ui/checkbox";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";

import type { AudienceSources } from "@/gradient/types/campaign";

interface Props {
  sources: AudienceSources;
  filters: Record<string, unknown>;
  disabled?: boolean;
  onChange: (next: Record<string, unknown>) => void;
}

const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);

/**
 * Website leads, grouped by the form they came from.
 *
 * Each source is a heading with its sub-sources beneath it, because that is how
 * the data is actually shaped — "AI Program" is a source and "Download
 * curriculum" is one of the things people did on it.
 *
 * Ticking a source takes everyone from it. Ticking sub-sources instead narrows
 * to those, which is why picking a source **and** one of its own sub-sources is
 * pointless rather than clever: the resolver ANDs them, so the sub-source wins
 * and the source tick does nothing. The header checkbox therefore clears its
 * children when it is ticked, so the two can never contradict each other.
 */
export default function LeadFilters({
  sources,
  filters,
  disabled,
  onChange,
}: Props) {
  const [search, setSearch] = useState("");

  const selectedSources = arr(filters.source);
  const selectedSubSources = arr(filters.subSource);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();

    return sources.leads.sources
      .map((s) => {
        const label = s.sourceDisplayName || s.source;
        const subs = (s.subSources || []).map((sub) => ({
          value: sub.subSource,
          label: sub.subSourceDisplayName || sub.subSource,
        }));

        if (!q) return { value: s.source, label, subs };

        if (label.toLowerCase().includes(q)) return { value: s.source, label, subs };

        const hits = subs.filter((sub) => sub.label.toLowerCase().includes(q));
        return hits.length ? { value: s.source, label, subs: hits } : null;
      })
      .filter(Boolean) as { value: string; label: string; subs: { value: string; label: string }[] }[];
  }, [sources.leads.sources, search]);

  const toggleSource = (value: string, subs: string[]) => {
    const on = selectedSources.includes(value);

    onChange({
      ...filters,
      source: on
        ? selectedSources.filter((v) => v !== value)
        : [...selectedSources, value],
      // Taking the whole source makes its own sub-source ticks meaningless.
      subSource: on
        ? selectedSubSources
        : selectedSubSources.filter((v) => !subs.includes(v)),
    });
  };

  const toggleSub = (value: string, parent: string) => {
    const on = selectedSubSources.includes(value);

    onChange({
      ...filters,
      subSource: on
        ? selectedSubSources.filter((v) => v !== value)
        : [...selectedSubSources, value],
      // …and the reverse: narrowing to a sub-source contradicts "all of it".
      source: on ? selectedSources : selectedSources.filter((v) => v !== parent),
    });
  };

  const total = selectedSources.length + selectedSubSources.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lead sources"
            disabled={disabled}
            className="h-9 pl-9 text-sm"
          />
        </div>

        {total > 0 && !disabled && (
          <button
            type="button"
            onClick={() => onChange({ ...filters, source: [], subSource: [] })}
            className="text-muted-foreground hover:text-foreground text-xs underline"
          >
            Clear
          </button>
        )}
      </div>

      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {groups.map((group) => {
          const wholeSource = selectedSources.includes(group.value);

          return (
            <div key={group.value} className="rounded-lg border bg-white">
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                <Checkbox
                  checked={wholeSource}
                  onCheckedChange={() =>
                    toggleSource(
                      group.value,
                      group.subs.map((s) => s.value),
                    )
                  }
                  disabled={disabled}
                />
                <span className="text-sm font-medium">{group.label}</span>
                {wholeSource && (
                  <span className="text-primary bg-primary/10 ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium">
                    everyone
                  </span>
                )}
              </label>

              {group.subs.length > 0 && (
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 border-t px-4 py-2 pl-11">
                  {group.subs.map((sub) => (
                    <label
                      key={sub.value}
                      className={`flex items-center gap-2 text-xs ${
                        wholeSource
                          ? "text-muted-foreground/50 cursor-not-allowed"
                          : "cursor-pointer"
                      }`}
                    >
                      <Checkbox
                        checked={selectedSubSources.includes(sub.value)}
                        onCheckedChange={() => toggleSub(sub.value, group.value)}
                        disabled={disabled || wholeSource}
                      />
                      {sub.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {!groups.length && (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No lead sources match that.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-muted-foreground text-[11px]">
          {total === 0
            ? "Nothing ticked — every website lead"
            : `${total} selected`}
        </Label>
      </div>
    </div>
  );
}

"use client";

import { Users } from "lucide-react";

import { Badge } from "@/gradient/components/ui/badge";
import { Checkbox } from "@/gradient/components/ui/checkbox";

import type { AudienceSources } from "@/gradient/types/campaign";
import StepShell from "./StepShell";

interface Props {
  sources: AudienceSources;
  selectedIds: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}

/**
 * Which recordings' viewers to mail.
 *
 * One count per row, not two: `RecordingLeads` holds one row per (recording,
 * email), so unlike resource downloads there is no gap between "rows captured"
 * and "people reachable".
 *
 * Category is shown but not selectable here — it is a chip group in the
 * accordion, because "everyone who watched an SQL session" is a filter on the
 * category rather than a hand-picked list of recordings.
 */
export default function RecordingStep({
  sources,
  selectedIds,
  disabled,
  onChange,
}: Props) {
  const categoryName = Object.fromEntries(
    sources.recordings.categories.map((c) => [c.id, c.name]),
  );

  const toggle = (id: string) =>
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((v) => v !== id)
        : [...selectedIds, id],
    );

  return (
    <StepShell
      items={sources.recordings.items}
      selectedCount={selectedIds.length}
      keyOf={(r) => r.id}
      isSelected={(r) => selectedIds.includes(r.id)}
      searchText={(r) =>
        `${r.title} ${(r.categoryId && categoryName[r.categoryId]) || ""}`
      }
      placeholder="Search recordings…"
      emptyLabel="No recordings found"
      noun="recording"
      render={(recording, selected) => (
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-lg border bg-white px-4 py-3 transition ${
            selected ? "border-primary/50" : "hover:border-muted-foreground/30"
          }`}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={() => toggle(recording.id)}
            disabled={disabled}
            className="mt-0.5"
          />

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{recording.title}</span>
              {recording.categoryId && categoryName[recording.categoryId] && (
                <Badge
                  variant="secondary"
                  className="h-4 px-1.5 py-0 text-[10px]"
                >
                  {categoryName[recording.categoryId]}
                </Badge>
              )}
            </div>

            <div className="text-muted-foreground flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {recording.people.toLocaleString()} signed up
              </span>
            </div>
          </div>
        </label>
      )}
    />
  );
}

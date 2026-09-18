"use client";

import { Download, Users } from "lucide-react";

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
 * Which resources' downloaders to mail.
 *
 * Each row shows downloads and people separately. They are not the same number
 * — nothing dedupes at capture, so one person taking a resource four times is
 * four rows — and showing only downloads would overstate every audience built
 * from this source.
 */
export default function ResourceStep({
  sources,
  selectedIds,
  disabled,
  onChange,
}: Props) {
  const toggle = (id: string) =>
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((v) => v !== id)
        : [...selectedIds, id],
    );

  return (
    <StepShell
      items={sources.resources.items}
      selectedCount={selectedIds.length}
      keyOf={(r) => r.id}
      isSelected={(r) => selectedIds.includes(r.id)}
      searchText={(r) =>
        `${r.title} ${r.resourceType || ""} ${r.resourceCategory || ""}`
      }
      placeholder="Search resources…"
      emptyLabel="No resources found"
      noun="resource"
      render={(resource, selected) => (
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-lg border bg-white px-4 py-3 transition ${
            selected ? "border-primary/50" : "hover:border-muted-foreground/30"
          }`}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={() => toggle(resource.id)}
            disabled={disabled}
            className="mt-0.5"
          />

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{resource.title}</span>
              {resource.resourceType && (
                <Badge
                  variant="secondary"
                  className="h-4 px-1.5 py-0 text-[10px]"
                >
                  {resource.resourceType}
                </Badge>
              )}
              {resource.resourceCategory && (
                <Badge
                  variant="secondary"
                  className="h-4 px-1.5 py-0 text-[10px]"
                >
                  {resource.resourceCategory}
                </Badge>
              )}
            </div>

            <div className="text-muted-foreground flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {resource.people.toLocaleString()} people
              </span>
              <span className="flex items-center gap-1">
                <Download className="h-3 w-3" />
                {resource.downloads.toLocaleString()} downloads
              </span>
            </div>
          </div>
        </label>
      )}
    />
  );
}

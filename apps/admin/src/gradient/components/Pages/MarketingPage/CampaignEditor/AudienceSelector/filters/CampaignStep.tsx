"use client";

import { Send } from "lucide-react";

import { Badge } from "@/gradient/components/ui/badge";
import { Checkbox } from "@/gradient/components/ui/checkbox";

import type { AudienceSources } from "@/gradient/types/campaign";
import { CAMPAIGN_STATUS_LABELS, CAMPAIGN_STATUS_STYLES } from "@/gradient/types/campaign";
import StepShell from "./StepShell";

interface Props {
  sources: AudienceSources;
  selectedIds: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}

/**
 * People a previous campaign reached.
 *
 * The most useful source in the exclude half — "everyone except last week's
 * send" is the segment that stops a list being mailed twice in a week — and it
 * is why the exclude side is worth having at all.
 *
 * Draft and scheduled campaigns are listed but say so: they have no recipients
 * yet, so picking one resolves to nobody. Hiding them would leave someone
 * hunting for a campaign they can see everywhere else in the panel.
 */
export default function CampaignStep({
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

  if (!sources.campaigns.items.length) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-center">
        <Send className="h-7 w-7 opacity-30" />
        <p className="text-sm">No campaigns yet.</p>
      </div>
    );
  }

  return (
    <StepShell
      items={sources.campaigns.items}
      selectedCount={selectedIds.length}
      keyOf={(c) => c.id}
      isSelected={(c) => selectedIds.includes(c.id)}
      searchText={(c) => c.name}
      placeholder="Search campaigns…"
      emptyLabel="No campaigns found"
      noun="campaign"
      render={(campaign, selected) => (
        <label
          className={`flex cursor-pointer items-center gap-3 rounded-lg border bg-white px-4 py-3 transition ${
            selected ? "border-primary/50" : "hover:border-muted-foreground/30"
          }`}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={() => toggle(campaign.id)}
            disabled={disabled}
          />

          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {campaign.name}
            </span>
            <span className="text-muted-foreground block text-[11px]">
              {campaign.sentAt
                ? `Sent ${new Date(campaign.sentAt).toLocaleDateString(undefined, {
                    dateStyle: "medium",
                  })}`
                : "Never sent — this will resolve to nobody"}
            </span>
          </span>

          <Badge
            variant="outline"
            className={`shrink-0 text-[10px] font-medium ${CAMPAIGN_STATUS_STYLES[campaign.status]}`}
          >
            {CAMPAIGN_STATUS_LABELS[campaign.status]}
          </Badge>
        </label>
      )}
    />
  );
}

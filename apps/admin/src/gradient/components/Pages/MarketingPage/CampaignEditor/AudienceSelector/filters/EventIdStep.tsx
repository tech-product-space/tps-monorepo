"use client";

import { CalendarDays, Users } from "lucide-react";

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
 * Events, picked as a plain list of ids.
 *
 * Distinct from `EventStep`, which exists only for event *registrations* — that
 * one attaches a status and an attendee type to each event, because "approved
 * for March, waitlisted for April" is an ordinary thing to want.
 *
 * Certificate holders, feedback respondents and referrers do not need any of
 * that: the event is the whole filter, and their other narrowing (issued vs
 * revoked, responded or not, a referral floor) applies across all of them at
 * once. So this writes `eventId: string[]`, which is exactly what those three
 * resolvers read.
 */
export default function EventIdStep({
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
      items={sources.events.items}
      selectedCount={selectedIds.length}
      keyOf={(e) => e.id}
      isSelected={(e) => selectedIds.includes(e.id)}
      searchText={(e) => e.eventTitle}
      placeholder="Search events…"
      emptyLabel="No events found"
      noun="event"
      render={(event, selected) => (
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-lg border bg-white px-4 py-3 transition ${
            selected ? "border-primary/50" : "hover:border-muted-foreground/30"
          }`}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={() => toggle(event.id)}
            disabled={disabled}
            className="mt-0.5"
          />

          <span className="min-w-0 flex-1 space-y-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{event.eventTitle}</span>
              {event.eventStartDate && (
                <Badge
                  variant="secondary"
                  className="h-4 px-1.5 py-0 text-[10px]"
                >
                  {new Date(event.eventStartDate).toLocaleDateString(undefined, {
                    dateStyle: "medium",
                  })}
                </Badge>
              )}
            </span>

            {/* The guest count, not a certificate or feedback count — it is an
                upper bound on this source rather than its size, and saying so
                beats implying a number we do not have. */}
            <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
              <Users className="h-3 w-3" />
              {event.totalGuests.toLocaleString()} guests in total
            </span>
          </span>

          <CalendarDays className="text-muted-foreground/40 mt-0.5 h-4 w-4 shrink-0" />
        </label>
      )}
    />
  );
}

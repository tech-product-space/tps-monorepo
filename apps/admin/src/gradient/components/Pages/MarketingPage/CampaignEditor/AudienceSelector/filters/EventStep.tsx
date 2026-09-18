"use client";

import { CheckCircle2, Clock, Users } from "lucide-react";

import { Badge } from "@/gradient/components/ui/badge";
import { Checkbox } from "@/gradient/components/ui/checkbox";
import { Label } from "@/gradient/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";

import type { AudienceSources } from "@/gradient/types/campaign";
import StepShell from "./StepShell";

export interface EventFilter {
  status?: string;
  attendeeType?: string;
}

interface Props {
  sources: AudienceSources;
  eventFilters: Record<string, EventFilter>;
  disabled?: boolean;
  onChange: (next: Record<string, EventFilter>) => void;
}

/**
 * Which events, and which of their guests.
 *
 * Status and attendee type are set **per event** because "approved for the
 * March workshop, waitlisted for April" is an ordinary thing to want and a
 * single global control cannot say it.
 */
export default function EventStep({
  sources,
  eventFilters,
  disabled,
  onChange,
}: Props) {
  const events = sources.events.items;
  const selectedIds = Object.keys(eventFilters);

  const toggle = (id: string) => {
    const next = { ...eventFilters };
    if (next[id]) delete next[id];
    else next[id] = {};
    onChange(next);
  };

  const patch = (id: string, p: EventFilter) =>
    onChange({ ...eventFilters, [id]: { ...eventFilters[id], ...p } });

  return (
    <StepShell
      items={events}
      selectedCount={selectedIds.length}
      keyOf={(e) => e.id}
      isSelected={(e) => Boolean(eventFilters[e.id])}
      searchText={(e) => e.eventTitle}
      placeholder="Search events…"
      emptyLabel="No events found"
      noun="event"
      render={(event, selected) => {
        const stats = event.guestsByStatus || {};
        const config = eventFilters[event.id] || {};

        return (
          <div
            className={`rounded-lg border bg-white transition ${
              selected ? "border-primary/50" : "hover:border-muted-foreground/30"
            }`}
          >
            <label className="flex cursor-pointer items-start gap-3 px-4 pt-3 pb-2">
              <Checkbox
                checked={selected}
                onCheckedChange={() => toggle(event.id)}
                disabled={disabled}
                className="mt-0.5"
              />

              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{event.eventTitle}</span>
                  {event.eventStartDate && (
                    <Badge
                      variant="secondary"
                      className="h-4 px-1.5 py-0 text-[10px]"
                    >
                      {new Date(event.eventStartDate).toLocaleDateString(
                        undefined,
                        { dateStyle: "medium" },
                      )}
                    </Badge>
                  )}
                </div>

                {/* Counts are mailable guests — those with an email address —
                    so the number here matches what the preview will say. */}
                <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {event.totalGuests.toLocaleString()} guests
                  </span>
                  {Object.entries(stats)
                    .filter(([, n]) => n > 0)
                    .slice(0, 3)
                    .map(([status, n]) => (
                      <span
                        key={status}
                        className="flex items-center gap-1"
                      >
                        {status.toLowerCase().includes("approv") ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Clock className="h-3 w-3 text-amber-500" />
                        )}
                        {n.toLocaleString()} {status.toLowerCase()}
                      </span>
                    ))}
                </div>
              </div>
            </label>

            {selected && (
              <div className="flex flex-wrap items-center gap-4 border-t px-4 py-2.5 pl-11">
                <div className="flex flex-1 items-center gap-2">
                  <Label className="text-muted-foreground text-[11px]">
                    Status
                  </Label>
                  <Select
                    value={config.status || "all"}
                    onValueChange={(v) =>
                      patch(event.id, { status: v === "all" ? undefined : v })
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Everyone</SelectItem>
                      {sources.events.statuses.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-1 items-center gap-2">
                  <Label className="text-muted-foreground text-[11px]">
                    Type
                  </Label>
                  <Select
                    value={config.attendeeType || "all"}
                    onValueChange={(v) =>
                      patch(event.id, {
                        attendeeType: v === "all" ? undefined : v,
                      })
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Anyone</SelectItem>
                      {sources.events.attendeeTypes.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        );
      }}
    />
  );
}

"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Users, Loader2, CheckCircle2, Clock, XCircle } from "lucide-react";

export const EVENT_EMAIL_TARGET_TYPES = {
  ALL: "All",
  APPROVED: "Approved",
  WAITLIST: "Waitlist",
  DECLINED: "Declined",
} as const;

export const EVENT_EMAIL_TARGET_ROLES = {
  ALL: "All",
  PROFESSIONAL: "Professional",
  STUDENT: "Student",
} as const;

export type TargetType =
  (typeof EVENT_EMAIL_TARGET_TYPES)[keyof typeof EVENT_EMAIL_TARGET_TYPES];

export type TargetRole =
  (typeof EVENT_EMAIL_TARGET_ROLES)[keyof typeof EVENT_EMAIL_TARGET_ROLES];

export interface IEventFilter {
  targetGuestType: TargetType;
  targetGuestRole: TargetRole;
}

export interface ICampaignEvent {
  id: number;
  eventTitle: string;
  eventType: string;
  eventCategory: string;
  totalGuests: string;
  approvedGuests: string;
  declinedGuests: string;
  waitlistedGuests: string;
}

type Props = {
  events: ICampaignEvent[];
  loading: boolean;
  selectedEventIds: number[];
  onToggleEvent: (id: number) => void;
  eventFilters: Record<number, IEventFilter>;
  onFilterChange: (eventId: number, filter: Partial<IEventFilter>) => void;
};

const DEFAULT_FILTER: IEventFilter = {
  targetGuestType: EVENT_EMAIL_TARGET_TYPES.ALL,
  targetGuestRole: EVENT_EMAIL_TARGET_ROLES.ALL,
};

export default function EventGuestsStep({
  events,
  loading,
  selectedEventIds,
  onToggleEvent,
  eventFilters = {},
  onFilterChange,
}: Props) {
  const [search, setSearch] = useState("");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);

  // Snapshot of selection when the step opened — sorting by this instead of
  // the live selection keeps items from jumping to the top as they're checked.
  const [initiallySelectedIds] = useState<Set<number>>(
    () => new Set(selectedEventIds),
  );

  /* -----------------------------
     Filter + sort events
  ----------------------------- */

  const filtered = events
    .filter((e) => {
      if (
        search &&
        !(
          e.eventTitle.toLowerCase().includes(search.toLowerCase()) ||
          e.eventType.toLowerCase().includes(search.toLowerCase()) ||
          e.eventCategory.toLowerCase().includes(search.toLowerCase())
        )
      ) {
        return false;
      }

      if (showSelectedOnly && !selectedEventIds.includes(e.id)) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      const aSelected = initiallySelectedIds.has(a.id);
      const bSelected = initiallySelectedIds.has(b.id);

      if (aSelected === bSelected) return 0;
      return aSelected ? -1 : 1;
    });

  return (
    <div className="flex flex-col h-full gap-3">

      {/* Search */}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />

        <Input
          placeholder="Search events..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* Toggle */}

      <div className="flex items-center gap-2 text-xs">
        <Checkbox
          checked={showSelectedOnly}
          onCheckedChange={(v) => setShowSelectedOnly(!!v)}
        />
        Show selected events only
      </div>
      
      {/* List */}

      <div className="flex-1 overflow-y-auto space-y-2">

        {loading && (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs">Loading events…</span>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Search className="w-7 h-7 mb-2 opacity-30" />
            <span className="text-sm">No events found</span>
          </div>
        )}

        {!loading &&
          filtered.map((event) => {
            const isSelected = selectedEventIds.includes(event.id);
            const total = parseInt(event.totalGuests);
            const approved = parseInt(event.approvedGuests);
            const declined = parseInt(event.declinedGuests);
            const waitlisted = parseInt(event.waitlistedGuests);
            const filter = eventFilters[event.id] ?? DEFAULT_FILTER;

            return (
              <div
                key={event.id}
                className={`rounded-lg border bg-white transition ${isSelected
                    ? "border-gray-400"
                    : "border-gray-200 hover:border-gray-300"
                  }`}
              >

                {/* Header */}

                <div className="flex items-start gap-3 px-4 pt-3 pb-2">

                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleEvent(event.id)}
                  />

                  <div className="flex-1 space-y-1.5">

                    <div className="flex items-center gap-2 flex-wrap">

                      <span className="font-medium text-sm">
                        {event.eventTitle}
                      </span>

                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                        {event.eventType}
                      </Badge>

                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                        {event.eventCategory}
                      </Badge>

                    </div>

                    {/* Guest Stats */}

                    <div className="flex items-center gap-3 text-[11px] text-gray-400">

                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {total} guests
                      </span>

                      {approved > 0 && (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <CheckCircle2 className="w-3 h-3" />
                          {approved} approved
                        </span>
                      )}

                      {waitlisted > 0 && (
                        <span className="flex items-center gap-1 text-amber-500">
                          <Clock className="w-3 h-3" />
                          {waitlisted} waitlisted
                        </span>
                      )}

                      {declined > 0 && (
                        <span className="flex items-center gap-1 text-rose-500">
                          <XCircle className="w-3 h-3" />
                          {declined} declined
                        </span>
                      )}

                    </div>

                  </div>

                </div>

                {/* Divider */}

                <div className="mx-4 border-t border-gray-100" />

                {/* Filters */}

                <div className="flex items-center gap-4 px-4 py-2.5 pl-11">

                  <div className="flex items-center gap-2 flex-1">

                    <Label className="text-[11px] text-gray-400">
                      Audience
                    </Label>

                    <Select
                      value={filter.targetGuestType}
                      onValueChange={(value) =>
                        onFilterChange(event.id, {
                          targetGuestType: value as TargetType,
                        })
                      }
                    >

                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>

                      <SelectContent>
                        {Object.entries(EVENT_EMAIL_TARGET_TYPES).map(
                          ([, value]) => (
                            <SelectItem key={value} value={value}>
                              {value}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>

                    </Select>

                  </div>

                  <div className="w-px h-4 bg-gray-200" />

                  <div className="flex items-center gap-2 flex-1">

                    <Label className="text-[11px] text-gray-400">
                      Role
                    </Label>

                    <Select
                      value={filter.targetGuestRole}
                      onValueChange={(value) =>
                        onFilterChange(event.id, {
                          targetGuestRole: value as TargetRole,
                        })
                      }
                    >

                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>

                      <SelectContent>
                        {Object.entries(EVENT_EMAIL_TARGET_ROLES).map(
                          ([, value]) => (
                            <SelectItem key={value} value={value}>
                              {value}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>

                    </Select>

                  </div>

                </div>

              </div>
            );
          })}

      </div>

      {/* Footer */}

      {selectedEventIds.length > 0 && (
        <div className="pt-2.5 border-t border-gray-100 text-xs text-gray-400">
          <span className="font-medium text-gray-700">
            {selectedEventIds.length}
          </span>{" "}
          event{selectedEventIds.length > 1 ? "s" : ""} selected
        </div>
      )}

    </div>
  );
}
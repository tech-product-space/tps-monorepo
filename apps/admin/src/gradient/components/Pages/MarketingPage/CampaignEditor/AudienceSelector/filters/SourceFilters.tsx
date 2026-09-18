"use client";

import { Checkbox } from "@/gradient/components/ui/checkbox";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";

import type { AudienceSources, CampaignSourceType } from "@/gradient/types/campaign";

import { ChipGroup, DateRange, arr, patchFilters } from "./controls";

/**
 * The inline narrowing for the sources that are a handful of switches rather
 * than a long list of things.
 *
 * Written as one file with a branch per source rather than eight components,
 * because each is three controls and the shared vocabulary — a chip group, a
 * date range, "leaving it alone means everyone" — is worth stating once. The
 * controls themselves live in `controls.tsx`, shared with `MetaLeadFilters`.
 *
 * **The rule, everywhere: nothing ticked means no narrowing.** A key is deleted
 * rather than written as an empty array, so what is stored in the JSONB reads
 * the same way it behaves.
 */

interface Props {
  type: CampaignSourceType;
  sources: AudienceSources;
  filters: Record<string, unknown>;
  disabled?: boolean;
  onChange: (next: Record<string, unknown>) => void;
}

export default function SourceFilters({
  type,
  sources,
  filters,
  disabled,
  onChange,
}: Props) {
  const patch = (updates: Record<string, unknown>) =>
    onChange(patchFilters(filters, updates));

  const courseOptions = sources.freeCourses.items.map((c) => ({
    value: c.id,
    label: c.title,
  }));

  switch (type) {
    case "subscribers":
      return (
        <div className="space-y-4">
          <ChipGroup
            label="Where they subscribed"
            options={sources.subscribers.sources.map((s) => ({
              value: s,
              label: s,
            }))}
            selected={arr(filters.source)}
            disabled={disabled}
            onChange={(source) => patch({ source })}
          />
          <DateRange
            label="Subscribed between"
            fromKey="createdFrom"
            toKey="createdTo"
            filters={filters}
            disabled={disabled}
            onPatch={patch}
          />
        </div>
      );

    case "users":
      return (
        <div className="space-y-4">
          <label className="flex cursor-pointer items-start gap-2.5">
            <Checkbox
              checked={filters.emailVerified === true}
              onCheckedChange={(v) =>
                patch({ emailVerified: v ? true : undefined })
              }
              disabled={disabled}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm">Verified addresses only</span>
              <span className="text-muted-foreground block text-[11px]">
                An unverified address has never been proven to work. Worth
                ticking for anything that must actually arrive.
              </span>
            </span>
          </label>

          <DateRange
            label="Signed up between"
            fromKey="createdFrom"
            toKey="createdTo"
            filters={filters}
            disabled={disabled}
            onPatch={patch}
          />

          <DateRange
            label="Last signed in between"
            fromKey="lastLoginFrom"
            toKey="lastLoginTo"
            filters={filters}
            disabled={disabled}
            onPatch={patch}
          />
        </div>
      );

    case "recordingLeads":
      return (
        <div className="space-y-4">
          <ChipGroup
            label="Which categories"
            options={sources.recordings.categories.map((c) => ({
              value: c.id,
              label: c.name,
            }))}
            selected={arr(filters.categoryId)}
            disabled={disabled}
            onChange={(categoryId) => patch({ categoryId })}
          />
          <DateRange
            label="Signed up between"
            fromKey="createdFrom"
            toKey="createdTo"
            filters={filters}
            disabled={disabled}
            onPatch={patch}
          />
        </div>
      );

    case "freeCourseEnrolments":
      return (
        <div className="space-y-4">
          <ChipGroup
            label="Which courses"
            options={courseOptions}
            selected={arr(filters.freeCourseId)}
            disabled={disabled}
            onChange={(freeCourseId) => patch({ freeCourseId })}
          />
          <DateRange
            label="Enrolled between"
            fromKey="createdFrom"
            toKey="createdTo"
            filters={filters}
            disabled={disabled}
            onPatch={patch}
          />
        </div>
      );

    case "freeCourseProgress":
      return (
        <div className="space-y-4">
          <ChipGroup
            label="Which courses"
            options={courseOptions}
            selected={arr(filters.freeCourseId)}
            disabled={disabled}
            onChange={(freeCourseId) => patch({ freeCourseId })}
          />

          {/* One state, not several: the resolver reads a single value, and
              offering multi-select here would silently keep only the last. */}
          <div className="space-y-1.5">
            <Label className="text-xs">How far they got</Label>
            <div className="flex flex-wrap gap-1.5">
              {sources.freeCourseProgress.states.map((state) => {
                const on = (filters.state ?? "any") === state;

                return (
                  <button
                    key={state}
                    type="button"
                    disabled={disabled}
                    onClick={() => patch({ state })}
                    className={`rounded-full border px-2.5 py-1 text-xs transition disabled:opacity-50 ${
                      on
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "hover:border-muted-foreground/40 text-muted-foreground"
                    }`}
                  >
                    {state === "any"
                      ? "Anyone who started"
                      : state === "inProgress"
                        ? "Started but not finished"
                        : "Finished it"}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Nothing since</Label>
            <Input
              type="date"
              value={(filters.lastActivityBefore as string) || ""}
              onChange={(e) =>
                patch({ lastActivityBefore: e.target.value || undefined })
              }
              disabled={disabled}
              className="h-8 w-48 text-xs"
            />
            <p className="text-muted-foreground text-[11px]">
              The one that makes this source worth having: people who started
              and then went quiet.
            </p>
          </div>
        </div>
      );

    case "certificateHolders":
      return (
        <div className="space-y-4">
          <ChipGroup
            label="Certificate status"
            hint="Issued only, unless you say otherwise."
            options={sources.certificates.statuses.map((s) => ({
              value: s,
              label: s,
            }))}
            selected={arr(filters.status)}
            disabled={disabled}
            onChange={(status) => patch({ status })}
          />
          <ChipGroup
            label="How it was issued"
            options={sources.certificates.sources.map((s) => ({
              value: s,
              label: s,
            }))}
            selected={arr(filters.source)}
            disabled={disabled}
            onChange={(source) => patch({ source })}
          />
          <DateRange
            label="Issued between"
            fromKey="createdFrom"
            toKey="createdTo"
            filters={filters}
            disabled={disabled}
            onPatch={patch}
          />
        </div>
      );

    case "eventFeedback":
      return (
        <div className="space-y-4">
          <label className="flex cursor-pointer items-start gap-2.5">
            <Checkbox
              checked={filters.responded !== false}
              onCheckedChange={(v) => patch({ responded: v ? undefined : false })}
              disabled={disabled}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm">People who did reply</span>
              <span className="text-muted-foreground block text-[11px]">
                Untick to reach the guests who were asked and said nothing —
                which is the other half, and usually the larger one.
              </span>
            </span>
          </label>

          <ChipGroup
            label="Registration status"
            options={sources.events.statuses.map((s) => ({ value: s, label: s }))}
            selected={arr(filters.status)}
            disabled={disabled}
            onChange={(status) => patch({ status })}
          />

          <ChipGroup
            label="Attendee type"
            options={sources.events.attendeeTypes.map((t) => ({
              value: t,
              label: t,
            }))}
            selected={arr(filters.attendeeType)}
            disabled={disabled}
            onChange={(attendeeType) => patch({ attendeeType })}
          />
        </div>
      );

    case "eventReferrers":
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">Brought at least</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={(filters.minReferrals as number) ?? 1}
              onChange={(e) =>
                patch({ minReferrals: Math.max(1, Number(e.target.value) || 1) })
              }
              disabled={disabled}
              className="h-8 w-24 text-xs"
            />
            <span className="text-muted-foreground text-xs">
              other people to the event
            </span>
          </div>
          <p className="text-muted-foreground text-[11px]">
            Raise it to reach only the people who actually brought a crowd.
          </p>
        </div>
      );

    case "campaignRecipients":
      return (
        <ChipGroup
          label="Who to take from it"
          hint="Just the people it reached, unless you say otherwise."
          options={[
            { value: "sent", label: "Sent to them" },
            { value: "failed", label: "Failed to send" },
            { value: "suppressed", label: "Suppressed" },
            { value: "pending", label: "Never got sent" },
          ]}
          selected={arr(filters.status)}
          disabled={disabled}
          onChange={(status) => patch({ status })}
        />
      );

    default:
      return null;
  }
}

"use client";

import { Loader2 } from "lucide-react";

// Aliased: the type and this component would otherwise share a name.
import {
  META_LEAD_EDITABLE_STATUSES,
  META_LEAD_STATUS_LABELS,
  type MetaLeadFilters as MetaFilterOptions,
} from "@/gradient/types/meta";

import { ChipGroup, DateRange, arr, patchFilters } from "./controls";

interface Props {
  options: MetaFilterOptions | null;
  loading?: boolean;
  filters: Record<string, unknown>;
  disabled?: boolean;
  onChange: (next: Record<string, unknown>) => void;
}

/**
 * The inline narrowing for Facebook leads — everything that is a handful of
 * switches rather than a long list.
 *
 * The long lists (form, campaign, ad set, ad) live in the drill-down, because
 * the ad level alone runs to hundreds of rows. What is left fits here.
 *
 * Kept out of `SourceFilters` for the same reason `LeadFilters` is: its options
 * come from the Meta integration rather than from `/campaigns/sources`, and
 * threading a second options object through the shared switch statement to
 * serve one branch is worse than a file of its own.
 */
export default function MetaLeadFilters({
  options,
  loading,
  filters,
  disabled,
  onChange,
}: Props) {
  const patch = (updates: Record<string, unknown>) =>
    onChange(patchFilters(filters, updates));

  if (loading && !options) {
    return (
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading what there is to choose from…
      </p>
    );
  }

  const pickedSources = arr(filters.source);

  /**
   * Source and sub source come back as a flat list of pairs — one row per
   * combination that actually has leads — so both chip groups are built by
   * de-duplicating that list rather than by reading a tree.
   */
  const sourceOptions = Array.from(
    new Map(
      (options?.sources ?? [])
        .filter((s) => s.source)
        .map((s) => [
          s.source as string,
          {
            value: s.source as string,
            label: s.sourceDisplayName || (s.source as string),
          },
        ]),
    ).values(),
  );

  /**
   * Sub sources are offered only for the sources actually ticked.
   *
   * The full list across every source is long and means nothing on its own —
   * the same reasoning the website-lead filters already follow. With no source
   * ticked there is nothing to narrow *within*, so the group hides itself.
   */
  const subSourceOptions = pickedSources.length
    ? Array.from(
        new Map(
          (options?.sources ?? [])
            .filter((s) => s.subSource && pickedSources.includes(s.source ?? ""))
            .map((s) => [
              s.subSource as string,
              {
                value: s.subSource as string,
                label: s.subSourceDisplayName || (s.subSource as string),
              },
            ]),
        ).values(),
      )
    : [];

  return (
    <div className="space-y-4">
      {/* One page is the normal case, so this group vanishes on its own until
          there is genuinely a choice to make. */}
      {(options?.accounts.length ?? 0) > 1 && (
        <ChipGroup
          label="Which page"
          options={(options?.accounts ?? []).map((a) => ({
            value: a.id,
            label: a.name,
          }))}
          selected={arr(filters.accountId)}
          disabled={disabled}
          onChange={(accountId) => patch({ accountId })}
        />
      )}

      <ChipGroup
        label="Source"
        hint="How the form was routed when the lead was imported."
        options={sourceOptions}
        selected={pickedSources}
        disabled={disabled}
        onChange={(source) =>
          patch({
            source,
            // Sub sources belonging to a source that is no longer ticked would
            // sit in the JSONB invisibly and still narrow the audience.
            subSource: arr(filters.subSource).filter((sub) =>
              (options?.sources ?? []).some(
                (s) => s.subSource === sub && source.includes(s.source ?? ""),
              ),
            ),
          })
        }
      />

      <ChipGroup
        label="Sub source"
        options={subSourceOptions}
        selected={arr(filters.subSource)}
        disabled={disabled}
        onChange={(subSource) => patch({ subSource })}
      />

      {/* `skipped` is deliberately absent: it means no email and no phone, so
          it can never be mailed, and the resolver already excludes it unless
          an explicit status filter overrides the default. Offering it would
          only let someone build an audience of nobody. */}
      <ChipGroup
        label="Status"
        hint="Leave empty for everyone who has an email address."
        options={META_LEAD_EDITABLE_STATUSES.map((s) => ({
          value: s,
          label: META_LEAD_STATUS_LABELS[s],
        }))}
        selected={arr(filters.status)}
        disabled={disabled}
        onChange={(status) => patch({ status })}
      />

      <DateRange
        label="Submitted to Facebook between"
        hint="Facebook's own timestamp, not the date we imported it — so a backfill cannot sweep years of history into a recent-window send."
        fromKey="createdFrom"
        toKey="createdTo"
        filters={filters}
        disabled={disabled}
        onPatch={patch}
      />
    </div>
  );
}

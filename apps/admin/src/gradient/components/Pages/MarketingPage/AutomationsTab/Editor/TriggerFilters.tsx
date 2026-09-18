"use client";

import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { Checkbox } from "@/gradient/components/ui/checkbox";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";

import type { AudienceSources, CampaignSourceType } from "@/gradient/types/campaign";
import type { MetaFormOption } from "@/gradient/types/meta";

/**
 * Narrowing a realtime trigger to *which* events, resources, courses or forms.
 *
 * The backend has understood this shape since phase 3 — `matchesTriggerSource`
 * reads `eventIds`, `resourceIds`, `courseIds`, `source`/`subSource`, `status`
 * and `attendeeType` — so this is the missing half rather than a new feature.
 *
 * One rule the whole file is built around, and it is the backend's rule too:
 * **nothing ticked means everything matches.** TPS distinguishes "no filter"
 * from "an empty filter" and its own README lists the result as a gotcha,
 * because a workflow that silently never fires looks identical to one nobody
 * has triggered yet.
 */

/** A string list out of whatever the stored JSONB happens to hold. */
const asArray = (value: unknown): string[] => {
  if (value === undefined || value === null || value === "") return [];
  return (Array.isArray(value) ? value : [value]).map(String);
};

interface PickListProps {
  label: string;
  hint?: string;
  items: { id: string; label: string; sub?: string }[];
  selected: string[];
  disabled?: boolean;
  searchable?: boolean;
  onChange: (next: string[]) => void;
}

/**
 * A checkbox list that means "all" when it is empty.
 *
 * Said in the header rather than left to be inferred — the count is the only
 * place the difference between "everything" and "these three" is visible.
 */
function PickList({
  label,
  hint,
  items,
  selected,
  disabled,
  searchable = false,
  onChange,
}: PickListProps) {
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();

  const visible = useMemo(
    () =>
      query
        ? items.filter((item) =>
            `${item.label} ${item.sub ?? ""}`.toLowerCase().includes(query),
          )
        : items,
    [items, query],
  );

  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((v) => v !== id)
        : [...selected, id],
    );

  if (!items.length) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        <span className="text-[11px] text-muted-foreground">
          {selected.length ? (
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => onChange([])}
              disabled={disabled}
            >
              {selected.length} selected · clear
            </button>
          ) : (
            "Any"
          )}
        </span>
      </div>

      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}

      {searchable && items.length > 6 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-8 pl-8 text-xs"
          />
        </div>
      )}

      <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-md border bg-background p-1.5">
        {visible.length === 0 && (
          <p className="px-1.5 py-3 text-center text-[11px] text-muted-foreground">
            Nothing matches
          </p>
        )}

        {visible.map((item) => (
          <label
            key={item.id}
            className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-muted/50"
          >
            <Checkbox
              checked={selected.includes(item.id)}
              onCheckedChange={() => toggle(item.id)}
              disabled={disabled}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="block truncate text-xs">{item.label}</span>
              {item.sub && (
                <span className="block truncate text-[11px] text-muted-foreground">
                  {item.sub}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * Which Facebook lead forms start the journey.
 *
 * **Forms, and nothing else.** Page, campaign, ad set and ad are all on a Meta
 * lead and all tempting to filter on — and none of them is a handle that holds.
 * An ad is swapped weekly and a campaign renamed mid-flight, so a trigger keyed
 * on either quietly stops firing the next time marketing tidies up. The form is
 * what decides what the person was actually asked, which is what decides what
 * it makes sense to send them.
 *
 * The list is passed in rather than fetched here: the tab behind this dialog
 * needs the same names to write "Data Analytics Enrolment Form" on a collapsed
 * row, and two components fetching the same list would show different things
 * for a second every time one of them mounted.
 */
function MetaFormPicker({
  forms,
  selected,
  disabled,
  onChange,
}: {
  forms: MetaFormOption[] | null;
  selected: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}) {
  if (!forms) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading your lead forms…
      </p>
    );
  }

  if (!forms.length) {
    return (
      <p className="text-xs text-amber-700">
        No Facebook lead forms are connected yet. Connect a page under
        Integrations → Facebook and sync its forms, then come back.
      </p>
    );
  }

  return (
    <PickList
      label="Which forms"
      hint="Leave everything unticked to start on any Facebook lead."
      items={forms.map((form) => ({
        id: form.formId,
        label: form.name,
        // A switched-off form is still listed rather than hidden: a workflow
        // may already be watching one, and dropping it from the list would
        // make the trigger look like it was set to "any form".
        sub: [form.pageName, form.active ? null : "paused"]
          .filter(Boolean)
          .join(" · "),
      }))}
      selected={selected}
      disabled={disabled}
      searchable
      onChange={onChange}
    />
  );
}

interface Props {
  source: CampaignSourceType;
  filters: Record<string, unknown>;
  sources: AudienceSources | null;
  metaForms: MetaFormOption[] | null;
  loading?: boolean;
  disabled?: boolean;
  onChange: (filters: Record<string, unknown>) => void;
}

export default function TriggerFilters({
  source,
  filters,
  sources,
  metaForms,
  loading,
  disabled,
  onChange,
}: Props) {
  // `users` has nothing meaningful to narrow on — an account is an account, and
  // the backend's matcher says the same thing.
  if (source === "users") return null;

  // Facebook forms come from the Meta integration, not from the campaign
  // sources payload, so this branch must be reachable before that has landed.
  if (source === "metaLeads") {
    return (
      <MetaFormPicker
        forms={metaForms}
        selected={asArray(filters.formIds)}
        disabled={disabled}
        onChange={(formIds) => {
          // An empty list is dropped rather than stored. Both mean "any" to the
          // backend, but a stored `[]` reads as a filter to whoever opens the
          // JSONB later.
          const rest = { ...filters };
          delete (rest as Record<string, unknown>).formIds;
          onChange(formIds.length ? { ...rest, formIds } : rest);
        }}
      />
    );
  }

  if (loading || !sources) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading what there is to choose from…
      </p>
    );
  }

  const patch = (updates: Record<string, unknown>) => {
    const next: Record<string, unknown> = { ...filters, ...updates };

    // An empty array is deleted rather than stored. Both mean "any" to the
    // backend, but a stored `[]` reads as a filter to whoever opens the JSONB.
    for (const [key, value] of Object.entries(next)) {
      if (Array.isArray(value) && !value.length) delete next[key];
    }

    onChange(next);
  };

  if (source === "leads") {
    const picked = asArray(filters.source);

    // Sub-sources are only offered for the forms actually picked — the full
    // list across every form is hundreds of rows and means nothing on its own.
    const subSourceItems = sources.leads.sources
      .filter((s) => !picked.length || picked.includes(s.source))
      .flatMap((s) =>
        (s.subSources ?? []).map((sub) => ({
          id: sub.subSource,
          label: sub.subSourceDisplayName || sub.subSource,
          sub: s.sourceDisplayName || s.source,
        })),
      );

    return (
      <div className="space-y-3">
        <PickList
          label="Which forms"
          items={sources.leads.sources.map((s) => ({
            id: s.source,
            label: s.sourceDisplayName || s.source,
          }))}
          selected={picked}
          disabled={disabled}
          searchable
          onChange={(next) => patch({ source: next })}
        />

        {subSourceItems.length > 0 && (
          <PickList
            label="Narrower still"
            hint="Optional. Only the forms picked above are listed."
            items={subSourceItems}
            selected={asArray(filters.subSource)}
            disabled={disabled}
            searchable
            onChange={(subSource) => patch({ subSource })}
          />
        )}
      </div>
    );
  }

  if (source === "eventGuests") {
    return (
      <div className="space-y-3">
        <PickList
          label="Which events"
          items={sources.events.items.map((e) => ({
            id: e.id,
            label: e.eventTitle,
            sub: e.eventStartDate
              ? new Date(e.eventStartDate).toLocaleDateString(undefined, {
                  dateStyle: "medium",
                })
              : undefined,
          }))}
          selected={asArray(filters.eventIds)}
          disabled={disabled}
          searchable
          onChange={(eventIds) => patch({ eventIds })}
        />

        {/* Status is worth saying out loud: a registration usually lands as
            pending, so a trigger narrowed to "approved" fires on nobody at the
            moment they sign up. */}
        <PickList
          label="Only registrations that arrive as"
          hint="Most registrations arrive pending, so narrowing to approved will rarely fire on arrival."
          items={sources.events.statuses.map((s) => ({ id: s, label: s }))}
          selected={asArray(filters.status)}
          disabled={disabled}
          onChange={(status) => patch({ status })}
        />

        <PickList
          label="Attendee type"
          items={sources.events.attendeeTypes.map((t) => ({ id: t, label: t }))}
          selected={asArray(filters.attendeeType)}
          disabled={disabled}
          onChange={(attendeeType) => patch({ attendeeType })}
        />
      </div>
    );
  }

  if (source === "resourceLeads") {
    return (
      <PickList
        label="Which resources"
        items={sources.resources.items.map((r) => ({
          id: r.id,
          label: r.title,
          sub: r.resourceType || undefined,
        }))}
        selected={asArray(filters.resourceIds)}
        disabled={disabled}
        searchable
        onChange={(resourceIds) => patch({ resourceIds })}
      />
    );
  }

  if (source === "freeCourseEnrolments") {
    return (
      <PickList
        label="Which courses"
        items={sources.freeCourses.items.map((c) => ({
          id: c.id,
          label: c.title,
        }))}
        selected={asArray(filters.courseIds)}
        disabled={disabled}
        searchable
        onChange={(courseIds) => patch({ courseIds })}
      />
    );
  }

  return null;
}

/* ── the one-line summary the collapsed card shows ──────────────────────── */

/**
 * Names what was picked, not how many.
 *
 * "2 forms" tells you a filter exists; it does not tell you whether it is the
 * right one, so checking meant opening the picker every time. Naming them means
 * the row is readable at a glance — which is the whole job of a collapsed row.
 *
 * Capped at two names plus a count, because a trigger narrowed to nine events
 * is a paragraph and nobody reads it. Falls back to counts while the lists are
 * still loading, so the line never sits empty or flickers between shapes.
 */
const nameList = (
  ids: string[],
  lookup: Map<string, string>,
  noun: string,
  plural = `${noun}s`,
): string | null => {
  if (!ids.length) return null;

  const names = ids.map((id) => lookup.get(id)).filter(Boolean) as string[];

  // Nothing resolved: either the lists have not landed or the picks refer to
  // something deleted. Either way a count is honest and a blank is not.
  if (!names.length) {
    return `${ids.length} ${ids.length === 1 ? noun : plural}`;
  }

  const shown = names.slice(0, 2).join(", ");
  const rest = ids.length - Math.min(names.length, 2);

  return rest > 0 ? `${shown} +${rest} more` : shown;
};

const asMap = <T,>(
  items: T[] | undefined,
  id: (item: T) => string,
  label: (item: T) => string,
): Map<string, string> =>
  new Map((items ?? []).map((item) => [id(item), label(item)]));

/**
 * The line under a chosen trigger source: what it will actually fire on.
 */
export const describeSourceSelection = (
  source: CampaignSourceType,
  filters: Record<string, unknown> = {},
  sources: AudienceSources | null,
  metaForms: MetaFormOption[] | null,
): string => {
  const parts: string[] = [];
  const push = (value: string | null) => {
    if (value) parts.push(value);
  };

  switch (source) {
    case "leads": {
      const lookup = asMap(
        sources?.leads.sources,
        (s) => s.source,
        (s) => s.sourceDisplayName || s.source,
      );
      push(nameList(asArray(filters.source), lookup, "form"));

      const subs = asMap(
        sources?.leads.sources.flatMap((s) => s.subSources ?? []),
        (s) => s.subSource,
        (s) => s.subSourceDisplayName || s.subSource,
      );
      push(nameList(asArray(filters.subSource), subs, "sub-source"));
      break;
    }

    case "metaLeads":
      push(
        nameList(
          asArray(filters.formIds),
          asMap(metaForms ?? undefined, (f) => f.formId, (f) => f.name),
          "form",
        ),
      );
      break;

    case "eventGuests": {
      push(
        nameList(
          asArray(filters.eventIds),
          asMap(sources?.events.items, (e) => e.id, (e) => e.eventTitle),
          "event",
        ),
      );
      // Status and type are short enough to name outright.
      const statuses = asArray(filters.status);
      if (statuses.length) push(statuses.join(", "));
      const types = asArray(filters.attendeeType);
      if (types.length) push(types.join(", "));
      break;
    }

    case "resourceLeads":
      push(
        nameList(
          asArray(filters.resourceIds),
          asMap(sources?.resources.items, (r) => r.id, (r) => r.title),
          "resource",
        ),
      );
      break;

    case "freeCourseEnrolments":
      push(
        nameList(
          asArray(filters.courseIds),
          asMap(sources?.freeCourses.items, (c) => c.id, (c) => c.title),
          "course",
        ),
      );
      break;

    default:
      break;
  }

  return parts.length ? parts.join(" · ") : "Anyone from this source";
};

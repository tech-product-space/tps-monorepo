"use client";

import { useState } from "react";
import { Megaphone } from "lucide-react";

import { Checkbox } from "@/gradient/components/ui/checkbox";

import type { MetaFilterOption, MetaLeadFilters } from "@/gradient/types/meta";
import StepShell from "./StepShell";

/**
 * The four levels of Facebook's own hierarchy, each writing its own filter key.
 *
 * The keys are singular — `formId`, not `formIds` — because that is what
 * `resolveMetaLeads` reads through `inClause`. The realtime *trigger* stores
 * `formIds` for the same idea; the two are separate code paths and the backend
 * matcher accepts either, so nothing needs reconciling, but do not assume one
 * from the other.
 */
const LEVELS = [
  {
    key: "formId",
    tab: "Form",
    noun: "form",
    of: (filters: MetaLeadFilters) => filters.forms,
    /**
     * Said out loud because it is the one choice that stays true. An ad is
     * swapped weekly and a campaign is renamed mid-flight; the form is what
     * determines what the person was actually asked.
     */
    hint: "The most stable handle — a form outlives the creative that fed it.",
  },
  {
    key: "campaignId",
    tab: "Campaign",
    noun: "campaign",
    of: (filters: MetaLeadFilters) => filters.campaigns,
    hint: "Names change when marketing tidies up. Fine for a one-off send.",
  },
  {
    key: "adsetId",
    tab: "Ad set",
    noun: "ad set",
    of: (filters: MetaLeadFilters) => filters.adsets,
    hint: "Names change when marketing tidies up. Fine for a one-off send.",
  },
  {
    key: "adId",
    tab: "Ad",
    noun: "ad",
    of: (filters: MetaLeadFilters) => filters.ads,
    hint: "The creative itself — “who came in from Carousel-A”.",
  },
] as const;

type LevelKey = (typeof LEVELS)[number]["key"];

interface Props {
  options: MetaLeadFilters | null;
  loading?: boolean;
  filters: Record<string, unknown>;
  disabled?: boolean;
  onChange: (next: Record<string, unknown>) => void;
}

const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);

/**
 * Which Facebook leads to mail, picked from Facebook's own hierarchy.
 *
 * Four searchable lists behind a segmented control rather than four stacked
 * pickers: the ad level alone can run to hundreds of rows, and stacking them
 * puts the form list — the one most sends actually use — half a page below the
 * fold.
 *
 * **The lists are not cascaded.** The Meta Leads screen re-fetches to narrow
 * each level by the one above it, because it filters with single-select
 * dropdowns that have no search. Here every list is multi-select inside
 * `StepShell`, which already searches, so a second round trip per click would
 * buy nothing.
 *
 * Nothing ticked on a level means that level does not narrow. Ticking across
 * levels is an AND — form X *and* campaign Y — which is what the resolver does
 * with the keys.
 */
export default function MetaLeadStep({
  options,
  loading,
  filters,
  disabled,
  onChange,
}: Props) {
  const [level, setLevel] = useState<LevelKey>("formId");

  const active = LEVELS.find((l) => l.key === level)!;
  const items: MetaFilterOption[] = options ? active.of(options) : [];
  const selected = arr(filters[level]);

  const toggle = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((v) => v !== id)
      : [...selected, id];

    // Deleted rather than stored empty: both mean "any" to the resolver, and
    // only one of them reads that way in the JSONB later.
    const patched = { ...filters };
    if (next.length) patched[level] = next;
    else delete patched[level];

    onChange(patched);
  };

  // Facebook may simply not be connected, which is not an error — it is a
  // sentence. `getFilters` returns empty lists in that case rather than failing.
  if (!loading && options && !LEVELS.some((l) => l.of(options).length)) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-center">
        <Megaphone className="h-7 w-7 opacity-30" />
        <p className="text-sm">No Facebook leads have been imported yet.</p>
        <p className="text-xs">
          Connect a page under Integrations → Facebook, then come back.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {LEVELS.map((l) => {
          const count = arr(filters[l.key]).length;
          const on = l.key === level;

          return (
            <button
              key={l.key}
              type="button"
              onClick={() => setLevel(l.key)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                on
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "hover:border-muted-foreground/40 text-muted-foreground"
              }`}
            >
              {l.tab}
              {count > 0 && (
                <span className="ml-1.5 font-semibold">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-muted-foreground text-[11px]">{active.hint}</p>

      <div className="min-h-0 flex-1">
        {/* Keyed on the level so the shell's "keep what was already ticked at
            the top" snapshot is taken fresh for each list rather than carried
            over from the previous tab. */}
        <StepShell
          key={level}
          items={items}
          loading={loading}
          selectedCount={selected.length}
          keyOf={(o) => o.id}
          isSelected={(o) => selected.includes(o.id)}
          searchText={(o) => `${o.name} ${o.id}`}
          placeholder={`Search ${active.noun}s…`}
          emptyLabel={`No ${active.noun}s found`}
          noun={active.noun}
          render={(option, isOn) => (
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-lg border bg-white px-4 py-3 transition ${
                isOn ? "border-primary/50" : "hover:border-muted-foreground/30"
              }`}
            >
              <Checkbox
                checked={isOn}
                onCheckedChange={() => toggle(option.id)}
                disabled={disabled}
              />

              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {option.name}
              </span>

              {/* Facebook's id, shown because two ad sets a quarter apart are
                  routinely given the same name. */}
              <span className="text-muted-foreground shrink-0 font-mono text-[11px]">
                {option.id}
              </span>
            </label>
          )}
        />
      </div>
    </div>
  );
}

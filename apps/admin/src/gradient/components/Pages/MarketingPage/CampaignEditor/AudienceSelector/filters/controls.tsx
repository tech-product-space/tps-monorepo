"use client";

import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";

/**
 * The two controls every inline narrowing panel is built from.
 *
 * Lifted out of `SourceFilters` once a second panel needed them
 * (`MetaLeadFilters`). Two copies of a chip group is how the two end up
 * disagreeing about what "Any" looks like.
 *
 * **The rule both encode: nothing ticked means no narrowing.** The count in the
 * corner is the only place the difference between "everything" and "these three"
 * is visible, so it is always shown.
 */

/** A short list of values as toggleable pills. */
export function ChipGroup({
  label,
  hint,
  options,
  selected,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  options: { value: string; label: string }[];
  selected: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}) {
  if (!options.length) return null;

  const toggle = (value: string) =>
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        <span className="text-muted-foreground text-[11px]">
          {selected.length ? `${selected.length} selected` : "Any"}
        </span>
      </div>

      {hint && <p className="text-muted-foreground text-[11px]">{hint}</p>}

      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const on = selected.includes(option.value);

          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => toggle(option.value)}
              className={`rounded-full border px-2.5 py-1 text-xs transition disabled:opacity-50 ${
                on
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "hover:border-muted-foreground/40 text-muted-foreground"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateRange({
  label,
  hint = "Leave both empty for all time.",
  fromKey,
  toKey,
  filters,
  disabled,
  onPatch,
}: {
  label: string;
  /** Overridden where the dates mean something other than "when we saw them". */
  hint?: string;
  fromKey: string;
  toKey: string;
  filters: Record<string, unknown>;
  disabled?: boolean;
  onPatch: (updates: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={(filters[fromKey] as string) || ""}
          onChange={(e) => onPatch({ [fromKey]: e.target.value || undefined })}
          disabled={disabled}
          className="h-8 text-xs"
        />
        <span className="text-muted-foreground text-xs">to</span>
        <Input
          type="date"
          value={(filters[toKey] as string) || ""}
          onChange={(e) => onPatch({ [toKey]: e.target.value || undefined })}
          disabled={disabled}
          className="h-8 text-xs"
        />
      </div>
      <p className="text-muted-foreground text-[11px]">{hint}</p>
    </div>
  );
}

/**
 * Drops the keys that mean "no narrowing" before they reach the JSONB.
 *
 * An empty array and an absent key mean the same thing to every resolver, and
 * only one of them reads that way to whoever opens the column later.
 */
export const patchFilters = (
  filters: Record<string, unknown>,
  updates: Record<string, unknown>,
): Record<string, unknown> => {
  const next: Record<string, unknown> = { ...filters, ...updates };

  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || (Array.isArray(value) && !value.length)) {
      delete next[key];
    }
  }

  return next;
};

export const arr = (v: unknown): string[] =>
  Array.isArray(v) ? (v as string[]) : [];

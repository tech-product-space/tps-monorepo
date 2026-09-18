import {
  startOfDay,
  endOfDay,
  addDays,
  subDays,
  startOfMonth,
  endOfMonth,
  subMonths,
  format,
  isValid,
} from 'date-fns';

/**
 * Shared date-range presets.
 *
 * Originally lived under pages/DashboardHome and was backward-only, because a
 * dashboard reports on what already happened. The Meetings page broke that
 * assumption: most meetings are in the FUTURE, so a picker that can't express
 * "next 7 days" is useless there. Hence `allowFuture` — the one axis on which
 * the two callers genuinely differ.
 */
export type RangeKey =
  | 'today'
  | 'yesterday'
  | 'tomorrow'
  | '7d'
  | '30d'
  | '90d'
  | 'next_7d'
  | 'next_30d'
  | 'this_month'
  | 'last_month'
  | 'custom';

export type PresetKey = Exclude<RangeKey, 'custom'>;

export interface DateRange {
  key: RangeKey;
  label: string;
  from: Date;
  to: Date;
}

/** A labelled cluster of presets. An absent label renders as an unlabelled block. */
export interface PresetGroup {
  label?: string;
  keys: PresetKey[];
}

// Presets are day-aligned (not rolling-from-this-instant) so "Last 7 days"
// includes all of today and all of the 6 days before it. The backend derives
// the comparison window from the span, so a clean span keeps deltas honest.
//
// `allowFuture` only changes one builder — this_month. Everywhere it reports on
// the past it must stop at today (month-TO-DATE, or the dashboard would divide
// by days that haven't happened); on the Meetings page the rest of the month is
// exactly what you're looking for, because the calls are already booked.
const BUILDERS: Record<PresetKey, (allowFuture: boolean) => { from: Date; to: Date }> = {
  today: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }),
  yesterday: () => {
    const d = subDays(new Date(), 1);
    return { from: startOfDay(d), to: endOfDay(d) };
  },
  tomorrow: () => {
    const d = addDays(new Date(), 1);
    return { from: startOfDay(d), to: endOfDay(d) };
  },
  '7d': () => ({ from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) }),
  '30d': () => ({ from: startOfDay(subDays(new Date(), 29)), to: endOfDay(new Date()) }),
  '90d': () => ({ from: startOfDay(subDays(new Date(), 89)), to: endOfDay(new Date()) }),
  next_7d: () => ({ from: startOfDay(new Date()), to: endOfDay(addDays(new Date(), 6)) }),
  next_30d: () => ({ from: startOfDay(new Date()), to: endOfDay(addDays(new Date(), 29)) }),
  this_month: (allowFuture) => ({
    from: startOfMonth(new Date()),
    to: allowFuture ? endOfMonth(new Date()) : endOfDay(new Date()),
  }),
  last_month: () => {
    const d = subMonths(new Date(), 1);
    return { from: startOfMonth(d), to: endOfMonth(d) };
  },
};

export const PRESET_LABELS: Record<PresetKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  tomorrow: 'Tomorrow',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  next_7d: 'Next 7 days',
  next_30d: 'Next 30 days',
  this_month: 'This month',
  last_month: 'Last month',
};

/** Backward-only, one flat list — the dashboard's original menu, unchanged. */
export const DASHBOARD_PRESET_GROUPS: PresetGroup[] = [
  { keys: ['today', 'yesterday', '7d', '30d', '90d', 'this_month', 'last_month'] },
];

/**
 * Meetings cut both ways, so the menu says which way each preset looks rather
 * than leaving you to infer it from "last" vs "next" in seven near-identical
 * rows. Ahead comes first: the common question here is what's coming up.
 */
export const MEETINGS_PRESET_GROUPS: PresetGroup[] = [
  { keys: ['today', 'tomorrow'] },
  { label: 'Ahead', keys: ['next_7d', 'next_30d'] },
  { label: 'Behind', keys: ['yesterday', '7d', '30d'] },
  { label: 'Calendar', keys: ['this_month', 'last_month'] },
];

export function buildPreset(key: PresetKey, allowFuture = false): DateRange {
  const { from, to } = BUILDERS[key](allowFuture);
  return { key, label: PRESET_LABELS[key], from, to };
}

/** Build a custom range from two dates, normalising to full days and ordering them. */
export function buildCustom(fromInput: Date, toInput: Date): DateRange {
  const [a, b] = fromInput <= toInput ? [fromInput, toInput] : [toInput, fromInput];
  const from = startOfDay(a);
  const to = endOfDay(b);
  return { key: 'custom', label: formatSpan(from, to), from, to };
}

/** Parse a native <input type="date"> value ("YYYY-MM-DD"). */
export function parseDateInput(value: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return isValid(d) ? d : null;
}

/** Value for a native <input type="date">. */
export function toDateInput(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function formatSpan(from: Date, to: Date): string {
  const sameYear = from.getFullYear() === to.getFullYear();
  const left = format(from, sameYear ? 'd MMM' : 'd MMM yyyy');
  const right = format(to, 'd MMM yyyy');
  return `${left} – ${right}`;
}

/**
 * Stable primitive key for effect deps. Date objects are new identities on every
 * render, so depending on them directly would refetch forever.
 */
export function rangeSignature(r: DateRange): string {
  return `${r.from.getTime()}-${r.to.getTime()}`;
}

/** Whole days covered, used for the "vs previous N days" hint. */
export function spanDays(r: DateRange): number {
  return Math.max(1, Math.round((r.to.getTime() - r.from.getTime()) / 86400000));
}

/**
 * Restore a range from URL params.
 *
 * A preset is stored by KEY and rebuilt against today, so a link that said
 * "Next 7 days" still means the next 7 days whenever it's opened — not the week
 * it was copied. A custom range is stored as its two dates and stays put, which
 * is the whole point of choosing one.
 */
export function rangeFromParams(
  key: string | null,
  from: string | null,
  to: string | null,
  allowFuture = false,
): DateRange | null {
  if (key && key !== 'custom' && key in PRESET_LABELS) {
    return buildPreset(key as PresetKey, allowFuture);
  }
  const f = parseDateInput(from ?? '');
  const t = parseDateInput(to ?? '');
  if (f && t) return buildCustom(f, t);
  return null;
}

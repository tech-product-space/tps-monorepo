import type { KpiFormat } from './types';

// Indian-locale currency (₹) with compact grouping. Revenue values come from
// the backend already in rupees.
const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const intFmt = new Intl.NumberFormat('en-IN');

export function formatKpi(value: number | null, format: KpiFormat): string {
  if (value === null || value === undefined) return '—';
  switch (format) {
    case 'currency':
      return inr.format(value);
    case 'percent':
      return `${value}%`;
    case 'duration_min':
      return formatDuration(value);
    case 'number':
    default:
      return intFmt.format(value);
  }
}

export function formatCurrency(value: number): string {
  return inr.format(value || 0);
}

// Compact Indian notation for dense columns: ₹21K / ₹2.1L / ₹1.3Cr.
const inrCompact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatCurrencyCompact(value: number): string {
  return inrCompact.format(value || 0);
}

export function formatNumber(value: number): string {
  return intFmt.format(value || 0);
}

// Minutes → "45m" / "2h 10m" / "1d 3h".
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round(minutes - h * 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const days = Math.floor(hours / 24);
  const h = Math.round(hours - days * 24);
  return h ? `${days}d ${h}h` : `${days}d`;
}

// Categorical palette for charts that carry no server-side color (e.g. source
// pie). Ordered for good adjacent contrast.
export const CHART_PALETTE = [
  '#6366f1', // indigo
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#06b6d4', // cyan
  '#a855f7', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#3b82f6', // blue
  '#84cc16', // lime
  '#8b5cf6', // purple
];

export function paletteColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}

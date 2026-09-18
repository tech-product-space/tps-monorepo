import { paletteColor } from './format';

// Status.color in the DB is a Tailwind CLASS STRING, not a CSS colour —
// e.g. "bg-amber-50 text-amber-700 border-amber-100" or
//      "bg-rose-50 text-rose-700 ring-rose-500/20".
// The rest of the app renders it via className. Charts (SVG fill) need a real
// colour value, so we pull the Tailwind hue out of the class string and map it
// to a hex here.
//
// Statuses also reuse hues heavily — 6 are rose, 3 emerald, 3 amber — so a
// plain hue→hex map would paint six identical slices. assignStatusColors walks
// each hue group and steps through shades, keeping the semantic colour
// (rose = bad, emerald = good) while staying visually distinguishable.

const TAILWIND_HEX: Record<string, Record<number, string>> = {
  slate: { 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b' },
  gray: { 300: '#d1d5db', 400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151', 800: '#1f2937' },
  zinc: { 300: '#d4d4d8', 400: '#a1a1aa', 500: '#71717a', 600: '#52525b', 700: '#3f3f46', 800: '#27272a' },
  red: { 300: '#fca5a5', 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b' },
  orange: { 300: '#fdba74', 400: '#fb923c', 500: '#f97316', 600: '#ea580c', 700: '#c2410c', 800: '#9a3412' },
  amber: { 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e' },
  yellow: { 300: '#fde047', 400: '#facc15', 500: '#eab308', 600: '#ca8a04', 700: '#a16207', 800: '#854d0e' },
  lime: { 300: '#bef264', 400: '#a3e635', 500: '#84cc16', 600: '#65a30d', 700: '#4d7c0f', 800: '#3f6212' },
  green: { 300: '#86efac', 400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534' },
  emerald: { 300: '#6ee7b7', 400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46' },
  teal: { 300: '#5eead4', 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59' },
  cyan: { 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490', 800: '#155e75' },
  sky: { 300: '#7dd3fc', 400: '#38bdf8', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1', 800: '#075985' },
  blue: { 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af' },
  indigo: { 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 800: '#3730a3' },
  violet: { 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6' },
  purple: { 300: '#d8b4fe', 400: '#c084fc', 500: '#a855f7', 600: '#9333ea', 700: '#7e22ce', 800: '#6b21a8' },
  fuchsia: { 300: '#f0abfc', 400: '#e879f9', 500: '#d946ef', 600: '#c026d3', 700: '#a21caf', 800: '#86198f' },
  pink: { 300: '#f9a8d4', 400: '#f472b6', 500: '#ec4899', 600: '#db2777', 700: '#be185d', 800: '#9d174d' },
  rose: { 300: '#fda4af', 400: '#fb7185', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239' },
};

// Ordered so consecutive statuses sharing a hue stay far apart in lightness.
const SHADE_ORDER = [500, 700, 300, 600, 800, 400];

/** Pull the Tailwind hue out of a status class string, e.g. "amber". */
export function parseHue(colorClass?: string | null): string | null {
  if (!colorClass) return null;
  // Prefer the text-* token — it carries the saturated hue on every seeded status.
  const text = colorClass.match(/text-([a-z]+)-\d{2,3}/);
  if (text && TAILWIND_HEX[text[1]]) return text[1];
  const bg = colorClass.match(/bg-([a-z]+)-\d{2,3}/);
  if (bg && TAILWIND_HEX[bg[1]]) return bg[1];
  const ring = colorClass.match(/ring-([a-z]+)-\d{2,3}/);
  if (ring && TAILWIND_HEX[ring[1]]) return ring[1];
  return null;
}

export interface ColorableStatus {
  status_id: string;
  color?: string | null;
  sort_order?: number;
}

/**
 * Map each status_id to a concrete hex.
 *
 * Pass stages in a STABLE order (sort_order) — not by count — so a status keeps
 * the same colour as the numbers move between periods.
 */
export function assignStatusColors(stages: ColorableStatus[]): Map<string, string> {
  const seenPerHue = new Map<string, number>();
  const out = new Map<string, string>();
  let fallbackIndex = 0;

  for (const s of stages) {
    const hue = parseHue(s.color);
    if (!hue) {
      out.set(s.status_id, paletteColor(fallbackIndex++));
      continue;
    }
    const n = seenPerHue.get(hue) ?? 0;
    seenPerHue.set(hue, n + 1);
    const shade = SHADE_ORDER[n % SHADE_ORDER.length];
    out.set(s.status_id, TAILWIND_HEX[hue][shade]);
  }

  return out;
}

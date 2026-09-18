import { useMemo } from 'react';
import { Card, WidgetState } from './Card';
import { fetchSourcePerformance } from '../api';
import { useAsync } from '../useAsync';
import { formatNumber, formatCurrencyCompact } from '../format';
import { rangeSignature } from '@/crm/lib/dateRange';
import type { DateRange } from '@/crm/lib/dateRange';

// Ranked bars, not a pie.
//
// A pie was the wrong form here on several counts: it compares close values
// badly, it needed 8 categorical hues for what is a single measure, and past
// ~7 colour classes adjacent slices blur — so the tail got folded into an
// opaque "Other". Sources are nominal categories compared by magnitude, which
// is a one-hue bar chart: every bar is the same series (leads), so every bar is
// the same colour and the row label carries identity. No legend needed, no
// colour budget, so every source can be listed instead of hidden in "Other".
//
// It also surfaces conversions and revenue, which the endpoint already returned
// and the pie discarded. "Which source is biggest" is much less useful than
// "which source is actually worth it" — a channel can be a third of the leads
// and a twentieth of the revenue, and only this view shows that.

const BAR_COLOR = '#6366f1'; // indigo-500 — validated ≥3:1 on the white card surface

interface Row {
  label: string;
  leads: number;
  conversions: number;
  revenue: number;
  convPct: number;
  share: number;
}

export function SourceBreakdown({ range }: { range: DateRange }) {
  const { data, loading, error } = useAsync(
    () => fetchSourcePerformance(range),
    [rangeSignature(range)],
  );

  const { rows, totalLeads, totalRevenue } = useMemo(() => {
    const raw = (data?.rows || []).filter((r) => r.leads > 0);
    const leadsSum = raw.reduce((a, r) => a + r.leads, 0);
    const revenueSum = raw.reduce((a, r) => a + r.revenue, 0);
    const max = raw.reduce((a, r) => Math.max(a, r.leads), 0);

    const shaped: Row[] = raw
      .map((r) => ({
        label: r.subsource_label || '(direct)',
        leads: r.leads,
        conversions: r.conversions,
        revenue: r.revenue,
        convPct: r.leads ? (r.conversions / r.leads) * 100 : 0,
        // Bars scale against the biggest source, not the total — with a long
        // tail, share-of-total bars would all collapse to slivers.
        share: max ? (r.leads / max) * 100 : 0,
      }))
      .sort((a, b) => b.leads - a.leads);

    return { rows: shaped, totalLeads: leadsSum, totalRevenue: revenueSum };
  }, [data]);

  return (
    <Card
      title="Leads From Source"
      subtitle={
        rows.length
          ? `${formatNumber(totalLeads)} leads · ${formatCurrencyCompact(totalRevenue)} · ${rows.length} sources`
          : undefined
      }
      className="h-full flex flex-col overflow-hidden"
      bodyClassName="flex-1 min-h-0 overflow-auto"
    >
      {loading && <WidgetState status="loading" />}
      {!loading && error && <WidgetState status="error" error={error} />}
      {!loading && !error && rows.length === 0 && <WidgetState status="empty" empty />}

      {!loading && !error && rows.length > 0 && (
        <div>
          {/* Column headings — sticky through the body scroll. */}
          <div className="sticky top-0 z-10 bg-white flex items-baseline gap-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <span className="flex-1">Source</span>
            <span className="w-12 text-right">Leads</span>
            <span className="w-10 text-right">Conv</span>
            <span className="w-14 text-right">Revenue</span>
          </div>

          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.label}>
                <div className="flex items-baseline gap-2">
                  <span
                    className="flex-1 text-xs font-medium text-slate-700 truncate"
                    title={r.label}
                  >
                    {r.label}
                  </span>
                  <span className="w-12 text-right text-xs font-semibold text-slate-900 tabular-nums">
                    {formatNumber(r.leads)}
                  </span>
                  <span
                    className={
                      r.conversions > 0
                        ? 'w-10 text-right text-[11px] font-medium text-emerald-600 tabular-nums'
                        : 'w-10 text-right text-[11px] font-medium text-slate-300 tabular-nums'
                    }
                    title={`${r.conversions} conversions`}
                  >
                    {r.conversions > 0 ? `${r.convPct.toFixed(1)}%` : '—'}
                  </span>
                  <span
                    className={
                      r.revenue > 0
                        ? 'w-14 text-right text-[11px] font-medium text-slate-600 tabular-nums'
                        : 'w-14 text-right text-[11px] font-medium text-slate-300 tabular-nums'
                    }
                  >
                    {r.revenue > 0 ? formatCurrencyCompact(r.revenue) : '—'}
                  </span>
                </div>

                {/* Thin mark, rounded ends, anchored to the row's left baseline. */}
                <div className="mt-1 h-1 rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(r.share, 1.5)}%`,
                      backgroundColor: BAR_COLOR,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

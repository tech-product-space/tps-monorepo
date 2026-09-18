import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/crm/lib/utils';
import { Card, WidgetState } from './Card';
import { fetchFunnel } from '../api';
import { useAsync } from '../useAsync';
import { formatNumber } from '../format';
import { assignStatusColors } from '../statusColor';
import { rangeSignature } from '@/crm/lib/dateRange';
import type { DateRange } from '@/crm/lib/dateRange';

export function LeadStatusDonut({ range }: { range: DateRange }) {
  const { data, loading, error } = useAsync(() => fetchFunnel(range), [rangeSignature(range)]);

  const { ranked, total, pieData, colors, top } = useMemo(() => {
    const stages = data?.stages || [];

    // Colours are assigned in sort_order — a stable key — so a status keeps its
    // colour even as counts reorder the cards below.
    const colorMap = assignStatusColors(
      [...stages].sort((a, b) => a.sort_order - b.sort_order),
    );

    const byCount = [...stages].sort((a, b) => b.count - a.count);
    const sum = stages.reduce((acc, s) => acc + s.count, 0);

    return {
      ranked: byCount,
      total: sum,
      pieData: byCount.filter((s) => s.count > 0),
      colors: colorMap,
      top: byCount[0],
    };
  }, [data]);

  const pct = (n: number) => (total ? (n / total) * 100 : 0);

  return (
    <Card
      title="Lead Status"
      subtitle={
        total
          ? `Where the ${formatNumber(total)} leads that came in this period sit now · ${ranked.length} statuses`
          : undefined
      }
      right={
        <span className="text-[10px] font-medium text-slate-400">by lead update date</span>
      }
    >
      {loading && <WidgetState status="loading" />}
      {!loading && error && <WidgetState status="error" error={error} />}
      {!loading && !error && total === 0 && <WidgetState status="empty" empty />}

      {!loading && !error && total > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-7 items-center">
          {/* Donut */}
          <div className="flex flex-col items-center">
            <div className="relative h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={88}
                    outerRadius={126}
                    paddingAngle={1.5}
                    stroke="none"
                  >
                    {pieData.map((s) => (
                      <Cell key={s.status_id} fill={colors.get(s.status_id)} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [formatNumber(Number(value)), String(name)]}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-bold text-slate-900 tabular-nums leading-none">
                  {formatNumber(total)}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mt-1">
                  Total
                </span>
              </div>
            </div>

            {top && top.count > 0 && (
              <p className="text-[11px] font-medium text-slate-500 mt-1 text-center">
                Top status{' '}
                <span
                  className="font-semibold"
                  style={{ color: colors.get(top.status_id) }}
                >
                  {top.label}
                </span>{' '}
                · {formatNumber(top.count)}
              </p>
            )}
          </div>

          {/* Status cards — tinted with each status's own Tailwind classes, the
              same treatment used on lead tables and the detail panel. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ranked.map((s) => {
              const hex = colors.get(s.status_id);
              const share = pct(s.count);
              return (
                <div
                  key={s.status_id}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 transition-colors',
                    // Status config supplies bg/text/border classes; fall back
                    // to neutral when a status has no colour set.
                    s.color || 'bg-slate-50 text-slate-600 border-slate-200',
                    // Several statuses only carry `ring-*`, which does nothing
                    // without a ring width — make sure they still get an edge.
                    !s.color?.includes('border-') && 'border-transparent',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: hex }}
                    />
                    <span className="text-[11px] font-medium truncate opacity-90">
                      {s.label}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-base font-bold tabular-nums leading-none">
                      {formatNumber(s.count)}
                    </span>
                    <span className="text-[10px] font-medium opacity-70 tabular-nums">
                      {share.toFixed(1)}%
                    </span>
                  </div>

                  {/* Share bar */}
                  <div className="mt-1.5 h-1 rounded-full bg-black/5 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(share, share > 0 ? 2 : 0)}%`,
                        backgroundColor: hex,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

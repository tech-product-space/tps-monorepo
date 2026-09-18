import { cn } from '@/crm/lib/utils';
import { Card, WidgetState } from './Card';
import { fetchLeaderboard } from '../api';
import { useAsync } from '../useAsync';
import { formatCurrency, formatNumber, formatDuration } from '../format';
import { rangeSignature } from '@/crm/lib/dateRange';
import type { DateRange } from '@/crm/lib/dateRange';

export function Leaderboard({ range }: { range: DateRange }) {
  const { data, loading, error } = useAsync(() => fetchLeaderboard(range), [rangeSignature(range)]);
  const rows = data?.rows || [];

  return (
    <Card
      title="Leaderboard"
      subtitle={rows.length ? `${rows.length} agents · ranked by revenue` : 'Ranked by revenue'}
      className="h-full flex flex-col overflow-hidden"
      // One scroll container for BOTH axes. Splitting them (overflow-x on an
      // inner wrapper) makes the browser compute overflow-y:auto there too,
      // creating a nested scroller that the sticky thead would anchor to.
      bodyClassName="flex-1 min-h-0 overflow-auto"
    >
      {loading && <WidgetState status="loading" />}
      {!loading && error && <WidgetState status="error" error={error} />}
      {!loading && !error && rows.length === 0 && <WidgetState status="empty" empty />}

      {!loading && !error && rows.length > 0 && (
        <div className="-mx-1">
          <table className="w-full text-sm">
            {/* Sticky so the column headings survive the body scroll. */}
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="text-left font-semibold py-2 px-2">#</th>
                <th className="text-left font-semibold py-2 px-2">Agent</th>
                <th className="text-right font-semibold py-2 px-2">Leads</th>
                <th className="text-right font-semibold py-2 px-2">Conv.</th>
                <th className="text-right font-semibold py-2 px-2">Conv %</th>
                <th className="text-right font-semibold py-2 px-2">Avg 1st</th>
                <th className="text-right font-semibold py-2 px-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.agent_id}
                  className={cn(
                    'border-t border-slate-100',
                    r.is_other && 'text-slate-400 italic',
                  )}
                >
                  <td className="py-2.5 px-2 text-slate-400 font-medium tabular-nums">
                    {r.is_other ? '—' : i + 1}
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-2">
                      {!r.is_other && (
                        <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-[11px] font-semibold shrink-0">
                          {r.agent_name.charAt(0)}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 truncate">{r.agent_name}</div>
                        {r.role && (
                          <div className="text-[10px] font-medium text-slate-500">{r.role}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-slate-600 font-medium">
                    {formatNumber(r.leads)}
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-slate-600 font-medium">
                    {formatNumber(r.conversions)}
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-slate-600 font-medium">
                    {r.conv_pct}%
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-slate-500">
                    {r.avg_first_contact_min === null
                      ? '—'
                      : formatDuration(r.avg_first_contact_min)}
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums font-bold text-slate-900">
                    {formatCurrency(r.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

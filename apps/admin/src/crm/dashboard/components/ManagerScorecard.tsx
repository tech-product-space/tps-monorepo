import { Card, WidgetState } from './Card';
import { fetchManagerScorecard } from '../api';
import { useAsync } from '../useAsync';
import { formatCurrency, formatNumber } from '../format';
import { rangeSignature } from '@/crm/lib/dateRange';
import type { DateRange } from '@/crm/lib/dateRange';

// Superadmin-only widget: each manager's personal contribution vs their team's,
// with a combined total. Grouped columns under Personal / Team / Combined.
export function ManagerScorecard({ range }: { range: DateRange }) {
  const { data, loading, error } = useAsync(
    () => fetchManagerScorecard(range),
    [rangeSignature(range)],
  );
  const rows = data?.rows || [];

  return (
    <Card title="Manager Scorecard" subtitle="Personal vs team contribution">
      {loading && <WidgetState status="loading" />}
      {!loading && error && <WidgetState status="error" error={error} />}
      {!loading && !error && rows.length === 0 && <WidgetState status="empty" empty />}

      {!loading && !error && rows.length > 0 && (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <th rowSpan={2} className="text-left font-semibold py-2 px-2 align-bottom">
                  Manager
                </th>
                <th colSpan={2} className="text-center font-semibold py-1.5 px-2 border-b border-slate-100 text-indigo-500">
                  Personal
                </th>
                <th colSpan={2} className="text-center font-semibold py-1.5 px-2 border-b border-slate-100 text-violet-500">
                  Team
                </th>
                <th colSpan={2} className="text-center font-semibold py-1.5 px-2 border-b border-slate-100 text-emerald-600">
                  Combined
                </th>
              </tr>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="text-right font-semibold py-1.5 px-2">Conv.</th>
                <th className="text-right font-semibold py-1.5 px-2">Rev.</th>
                <th className="text-right font-semibold py-1.5 px-2">Conv.</th>
                <th className="text-right font-semibold py-1.5 px-2">Rev.</th>
                <th className="text-right font-semibold py-1.5 px-2">Conv.</th>
                <th className="text-right font-semibold py-1.5 px-2">Rev.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.manager_id} className="border-t border-slate-100">
                  <td className="py-2.5 px-2 font-medium text-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center text-[11px] font-semibold shrink-0">
                        {r.manager_name.charAt(0)}
                      </span>
                      <span className="truncate">{r.manager_name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-slate-600 font-medium">
                    {formatNumber(r.personal.conversions)}
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-slate-600 font-medium">
                    {formatCurrency(r.personal.revenue)}
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-slate-600 font-medium">
                    {formatNumber(r.team.conversions)}
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-slate-600 font-medium">
                    {formatCurrency(r.team.revenue)}
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums font-bold text-slate-900">
                    {formatNumber(r.combined.conversions)}
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums font-bold text-slate-900">
                    {formatCurrency(r.combined.revenue)}
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

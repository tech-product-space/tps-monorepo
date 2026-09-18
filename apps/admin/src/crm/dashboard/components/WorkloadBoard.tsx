import { useMemo } from 'react';
import { Card, WidgetState } from './Card';
import { fetchWorkload } from '../api';
import { useAsync } from '../useAsync';
import { formatNumber } from '../format';
import { assignStatusColors } from '../statusColor';

// Agent × Status matrix of current open leads (the reference "Agent's Board").
export function WorkloadBoard() {
  const { data, loading, error } = useAsync(() => fetchWorkload(), []);

  // Fast (agent_id|status_id) -> count lookup, plus per-agent totals.
  const { cellMap, totals } = useMemo(() => {
    const map = new Map<string, number>();
    const t = new Map<string, number>();
    for (const c of data?.matrix || []) {
      map.set(`${c.agent_id}|${c.status_id}`, c.count);
      t.set(c.agent_id, (t.get(c.agent_id) || 0) + c.count);
    }
    return { cellMap: map, totals: t };
  }, [data]);

  const agents = data?.agents || [];
  const statuses = data?.statuses || [];

  // Status.color is a Tailwind class string, not a CSS colour — resolve to hex
  // for the header dots. Keyed on sort_order so colours match the donut.
  const statusColors = useMemo(
    () =>
      assignStatusColors(
        [...statuses]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((s) => ({ status_id: s.id, color: s.color, sort_order: s.sort_order })),
      ),
    [statuses],
  );

  return (
    <Card title="Agent's Board" subtitle={`${agents.length} agents · open leads by status`}>
      {loading && <WidgetState status="loading" />}
      {!loading && error && <WidgetState status="error" error={error} />}
      {!loading && !error && agents.length === 0 && <WidgetState status="empty" empty />}

      {!loading && !error && agents.length > 0 && (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="text-left font-semibold py-2 px-2 sticky left-0 bg-white z-10">
                  Agent
                </th>
                <th className="text-right font-semibold py-2 px-2">Total</th>
                {statuses.map((s) => (
                  <th key={s.id} className="text-right font-semibold py-2 px-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: statusColors.get(s.id) || '#94a3b8' }}
                      />
                      {s.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="py-2.5 px-2 font-medium text-slate-800 sticky left-0 bg-white z-10 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center text-[11px] font-semibold shrink-0">
                        {a.name?.charAt(0) || '?'}
                      </span>
                      {a.name || 'Unknown'}
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums font-bold text-slate-900">
                    {formatNumber(totals.get(a.id) || 0)}
                  </td>
                  {statuses.map((s) => {
                    const count = cellMap.get(`${a.id}|${s.id}`) || 0;
                    return (
                      <td
                        key={s.id}
                        className="py-2.5 px-2 text-right tabular-nums text-slate-500"
                      >
                        {count === 0 ? (
                          <span className="text-slate-200">·</span>
                        ) : (
                          formatNumber(count)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

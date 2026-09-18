import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/crm/lib/utils';
import { fetchOverview } from '../api';
import { formatKpi } from '../format';
import { useAsync } from '../useAsync';
import { InfoTip } from './InfoTip';
import { rangeSignature, spanDays } from '@/crm/lib/dateRange';
import type { DateRange } from '@/crm/lib/dateRange';
import type { Kpi } from '../types';

// What each KPI means, keyed by the backend's kpi.key. `hint` fills the meta
// line for metrics that have no period-over-period delta (e.g. active agents),
// so those cards don't render a bare dash.
const KPI_INFO: Record<string, { description: string; hint?: string }> = {
  total_leads: {
    description:
      'Leads whose last entry or re-entry falls in this period. A lead that re-entered several times counts once, dated by its most recent entry. Matches the Leads page filtered on Lead update date.',
  },
  new_leads: {
    description:
      'Leads that arrived for the first time in this period, counted by their source created date.',
  },
  conversions: {
    description:
      'Enrollments whose first paid payment landed in this period. Instalments on an existing enrollment are not counted again.',
  },
  conv_pct: {
    description:
      'Conversions divided by new leads in this period. Conversions can come from leads that arrived earlier, so read this as sales velocity rather than a true cohort rate.',
  },
  revenue: {
    description:
      'Cash actually collected in this period — the sum of every paid payment, instalments included.',
  },
  active_agents: {
    description:
      'Distinct users who logged at least one activity (note, call, status change or follow-up) in this period.',
    hint: 'logged activity this period',
  },
  avg_first_contact: {
    description:
      'Average time between a lead arriving and the first activity logged against it.',
  },
};

function MetaLine({ kpi, range }: { kpi: Kpi; range: DateRange }) {
  const info = KPI_INFO[kpi.key];

  // No comparable previous window (or a metric that isn't compared at all).
  if (kpi.delta_pct === null || kpi.delta_pct === undefined) {
    return (
      <span className="text-[11px] font-medium text-slate-400">
        {info?.hint ?? 'no prior-period data'}
      </span>
    );
  }

  const up = kpi.delta_pct >= 0;
  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      <span
        className={cn(
          'inline-flex items-center gap-0.5 text-[11px] font-semibold',
          up ? 'text-emerald-600' : 'text-rose-500',
        )}
      >
        {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {Math.abs(kpi.delta_pct)}%
      </span>
      <span className="text-[11px] font-medium text-slate-400 truncate">
        vs prev {spanDays(range)}d
      </span>
    </span>
  );
}

function KpiCard({ kpi, range }: { kpi: Kpi; range: DateRange }) {
  const info = KPI_INFO[kpi.key];

  return (
    <div className="relative bg-white rounded-2xl border border-slate-300 shadow-sm shadow-slate-200/50 p-4 flex flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 leading-tight">
          {kpi.label}
        </span>
        {info?.description && <InfoTip text={info.description} />}
      </div>

      <span className="text-2xl font-bold text-slate-900 tracking-tight tabular-nums leading-none">
        {formatKpi(kpi.value, kpi.format)}
      </span>

      <MetaLine kpi={kpi} range={range} />
    </div>
  );
}

export function KpiRow({ range }: { range: DateRange }) {
  const { data, loading, error } = useAsync(() => fetchOverview(range), [rangeSignature(range)]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-600">
        {error}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      {data?.kpis.map((kpi) => (
        <KpiCard key={kpi.key} kpi={kpi} range={range} />
      ))}
    </div>
  );
}

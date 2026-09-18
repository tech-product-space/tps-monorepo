import { useState } from 'react';
import { useAuth } from '@/helpers/AuthContext';
import { DateRangePicker } from '@/crm/components/DateRangePicker/DateRangePicker';
import { KpiRow } from './components/KpiRow';
import { AlertsStrip } from './components/AlertsStrip';
import { LeadStatusDonut } from './components/LeadStatusDonut';
import { SourceBreakdown } from './components/SourceBreakdown';
import { ManagerScorecard } from './components/ManagerScorecard';
import { Leaderboard } from './components/Leaderboard';
import { WorkloadBoard } from './components/WorkloadBoard';
import { buildPreset, formatSpan } from '@/crm/lib/dateRange';
import type { DateRange } from '@/crm/lib/dateRange';

// Superadmin analytics dashboard. Org-wide by role scope (the backend resolves
// scopedUserIds = null for Superadmin, so every widget sees everything).
export function DashboardHome() {
  const { user } = useAuth();
  const [range, setRange] = useState<DateRange>(() => buildPreset('30d'));

  return (
    <div className="space-y-6 max-w-400 mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-xs font-medium text-slate-500 mt-0.5">
            Organization overview{user?.name ? ` · ${user.name}` : ''} ·{' '}
            <span className="text-slate-400">{formatSpan(range.from, range.to)}</span>
          </p>
        </div>
        {/* Not clearable here — every widget needs a window, so "no range" has
            no meaning. The null branch is unreachable; the guard is for types. */}
        <DateRangePicker value={range} onChange={(r) => r && setRange(r)} />
      </div>

      {/* KPI row */}
      <KpiRow range={range} />

      {/* Alerts — current-state snapshot, not affected by the date range */}
      <AlertsStrip />

      {/* Lead status donut (full width) */}
      <LeadStatusDonut range={range} />

      {/* Manager scorecard — Superadmin unique */}
      <ManagerScorecard range={range} />

      {/* Leaderboard + source split. Fixed row height at xl so both cards match
          exactly — the leaderboard scrolls internally instead of stretching the
          row to fit every agent. Below xl they stack and size naturally.
          grid-rows-1 is load-bearing: it makes the row minmax(0,1fr) so it can
          shrink below content height. A default `auto` row sizes to the tallest
          child and spills straight out of the fixed height. */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:h-105 xl:grid-rows-1">
        <Leaderboard range={range} />
        <SourceBreakdown range={range} />
      </div>

      {/* Agent's board (wide) — also a current-state snapshot */}
      <WorkloadBoard />
    </div>
  );
}

export default DashboardHome;

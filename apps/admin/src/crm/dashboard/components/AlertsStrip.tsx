import { AlertTriangle, Clock, UserX, Flame } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/crm/lib/utils';
import { fetchAlerts } from '../api';
import { useAsync } from '../useAsync';
import { formatNumber } from '../format';

interface AlertDef {
  key: 'overdue_followups' | 'sla_breach' | 'high_intent_unassigned' | 'stuck_open';
  label: string;
  icon: LucideIcon;
  tone: string;
}

const ALERTS: AlertDef[] = [
  { key: 'overdue_followups', label: 'Overdue follow-ups', icon: Clock, tone: 'rose' },
  { key: 'sla_breach', label: 'SLA breaches', icon: AlertTriangle, tone: 'amber' },
  { key: 'high_intent_unassigned', label: 'High-intent unassigned', icon: Flame, tone: 'orange' },
  { key: 'stuck_open', label: 'Stuck open leads', icon: UserX, tone: 'indigo' },
];

const TONES: Record<string, string> = {
  rose: 'bg-rose-50 border-rose-200 text-rose-600',
  amber: 'bg-amber-50 border-amber-200 text-amber-600',
  orange: 'bg-orange-50 border-orange-200 text-orange-600',
  indigo: 'bg-indigo-50 border-indigo-200 text-indigo-600',
};

export function AlertsStrip() {
  const { data, loading } = useAsync(() => fetchAlerts(), []);

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {ALERTS.map((a) => {
        const value = data?.[a.key];
        return (
          <div
            key={a.key}
            className={cn(
              'rounded-2xl border px-4 py-3 flex items-center gap-3',
              TONES[a.tone],
            )}
          >
            <a.icon className="w-5 h-5 shrink-0" />
            <div className="min-w-0">
              <div className="text-xl font-bold tabular-nums leading-none">
                {loading ? '—' : formatNumber(value || 0)}
              </div>
              <div className="text-[11px] font-medium opacity-80 mt-0.5 truncate">
                {a.label}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

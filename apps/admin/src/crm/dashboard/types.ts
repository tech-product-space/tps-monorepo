// Response shapes for the /api/v1/dashboard/* endpoints.
// Kept camelCase-free on purpose: these mirror the backend JSON 1:1 so the
// mapping boundary stays inside the fetch helpers where it's obvious.

export type KpiFormat = 'number' | 'percent' | 'currency' | 'duration_min';

export interface Kpi {
  key: string;
  label: string;
  value: number | null;
  delta_pct: number | null;
  format: KpiFormat;
}

export interface OverviewResponse {
  role: 'Agent' | 'Manager' | 'Superadmin';
  range: { from: string; to: string };
  kpis: Kpi[];
}

export interface FunnelStage {
  status_id: string;
  label: string;
  color: string | null;
  sort_order: number;
  count: number;
}

export interface FunnelResponse {
  stages: FunnelStage[];
  range: { from: string; to: string };
}

export interface SourceRow {
  subsource_id: string | null;
  subsource_label: string;
  product_label: string;
  leads: number;
  conversions: number;
  revenue: number;
}

export interface SourcePerformanceResponse {
  rows: SourceRow[];
  range: { from: string; to: string };
}

export interface LeaderboardRow {
  agent_id: string;
  agent_name: string;
  role: string | null;
  leads: number;
  conversions: number;
  revenue: number;
  conv_pct: number;
  avg_first_contact_min: number | null;
  is_other?: boolean;
}

export interface LeaderboardResponse {
  rows: LeaderboardRow[];
  range: { from: string; to: string };
}

export interface ScorecardBucket {
  leads: number;
  conversions: number;
  revenue: number;
}

export interface ManagerScorecardRow {
  manager_id: string;
  manager_name: string;
  personal: ScorecardBucket;
  team: ScorecardBucket;
  combined: ScorecardBucket;
}

export interface ManagerScorecardResponse {
  rows: ManagerScorecardRow[];
  range: { from: string; to: string };
}

export interface WorkloadAgent {
  id: string;
  name: string;
}

export interface WorkloadStatus {
  id: string;
  label: string;
  color: string | null;
  sort_order: number;
}

export interface WorkloadCell {
  agent_id: string;
  status_id: string;
  count: number;
}

export interface WorkloadResponse {
  agents: WorkloadAgent[];
  statuses: WorkloadStatus[];
  matrix: WorkloadCell[];
}

export interface AlertsResponse {
  stuck_open: number;
  sla_breach: number;
  high_intent_unassigned: number;
  overdue_followups: number;
}

// The selected window lives in ./dateRange (DateRange), re-exported here so
// widgets can pull types from one place.
export type { DateRange, RangeKey } from '@/crm/lib/dateRange';

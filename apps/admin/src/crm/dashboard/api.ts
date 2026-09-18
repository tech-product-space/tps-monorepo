import { PrivateAxios as api } from '@/helpers/PrivateAxios';
import type { DateRange } from '@/crm/lib/dateRange';
import type {
  OverviewResponse,
  FunnelResponse,
  SourcePerformanceResponse,
  LeaderboardResponse,
  ManagerScorecardResponse,
  WorkloadResponse,
  AlertsResponse,
} from './types';

// The dashboard endpoints take ?from=ISO&to=ISO (see backend
// utils/periodCompare.parseRange), and derive the comparison window from the span.
export function rangeParams(range: DateRange): { from: string; to: string } {
  return { from: range.from.toISOString(), to: range.to.toISOString() };
}

export async function fetchOverview(range: DateRange): Promise<OverviewResponse> {
  const { data } = await api.get('/dashboard/overview', { params: rangeParams(range) });
  return data;
}

export async function fetchFunnel(range: DateRange): Promise<FunnelResponse> {
  const { data } = await api.get('/dashboard/funnel', { params: rangeParams(range) });
  return data;
}

export async function fetchSourcePerformance(range: DateRange): Promise<SourcePerformanceResponse> {
  const { data } = await api.get('/dashboard/source-performance', { params: rangeParams(range) });
  return data;
}

export async function fetchLeaderboard(range: DateRange): Promise<LeaderboardResponse> {
  const { data } = await api.get('/dashboard/leaderboard', { params: rangeParams(range) });
  return data;
}

export async function fetchManagerScorecard(range: DateRange): Promise<ManagerScorecardResponse> {
  const { data } = await api.get('/dashboard/manager-scorecard', { params: rangeParams(range) });
  return data;
}

// Workload and alerts are current-state snapshots — no range needed.
export async function fetchWorkload(): Promise<WorkloadResponse> {
  const { data } = await api.get('/dashboard/workload');
  return data;
}

export async function fetchAlerts(): Promise<AlertsResponse> {
  const { data } = await api.get('/dashboard/alerts');
  return data;
}

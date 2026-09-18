import { IPaginationMeta } from "./pagination";

export type ActivityActorType = "admin" | "system" | "user";

export type ActivityStatus = "success" | "failure";

/** One changed field. `from` is null for creates, where there was no prior value. */
export interface ActivityChange {
  from: unknown;
  to: unknown;
}

/**
 * Keyed by field path — "name", "pricing.earlyBirdPrice". A value can also be a
 * bare string: redacted fields collapse to "[redacted]", and `_truncated` carries
 * a note when the diff was too large to store whole.
 */
export type ActivityChanges = Record<string, ActivityChange | string>;

export interface ActivityLog {
  id: string;

  actorType: ActivityActorType;
  /** Null for unauthenticated writes — see ACTIVITY_LOG_PLAN.md §7. */
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;

  /** "<entityType>.<verb>", e.g. "course.published". */
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  summary: string | null;

  changes: ActivityChanges;
  metadata: Record<string, unknown>;

  method: string | null;
  path: string | null;
  routeKey: string | null;
  statusCode: number | null;
  status: ActivityStatus;
  ipAddress: string | null;
  userAgent: string | null;

  createdAt: string;
}

export interface ActivityLogListResponse {
  success: boolean;
  data: ActivityLog[];
  meta: IPaginationMeta;
}

export interface ActivityFilterActor {
  actorId: string;
  actorName: string | null;
  actorEmail: string | null;
}

export interface ActivityFiltersResponse {
  success: boolean;
  data: {
    actors: ActivityFilterActor[];
    entityTypes: string[];
    actions: string[];
  };
}

export interface ActivityLogQuery {
  page?: number;
  limit?: number;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  action?: string | null;
  status?: ActivityStatus | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  search?: string;
}

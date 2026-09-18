/**
 * Facebook Lead Ads types, mirroring `gradient-backend`'s `meta_*` tables.
 *
 * `meta_leads` is a separate table from `leads` by design, so none of these
 * extend the `Lead` types — the two screens genuinely show different things.
 */

export type MetaTokenStatus = "unknown" | "valid" | "invalid";

export type MetaBackfillStatus = "running" | "done" | "error";

export type MetaLeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "converted"
  | "rejected"
  | "duplicate"
  /** No email and no phone. Kept, never mailed, not editable to or from. */
  | "skipped";

/** The statuses an admin may actually set — `skipped` is the importer's. */
export const META_LEAD_EDITABLE_STATUSES: MetaLeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "converted",
  "rejected",
  "duplicate",
];

export const META_LEAD_STATUS_LABELS: Record<MetaLeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  converted: "Converted",
  rejected: "Rejected",
  duplicate: "Duplicate",
  skipped: "Skipped",
};

/**
 * A managed source or sub source.
 *
 * `parentId === null` is a source; a set `parentId` makes it a sub source of
 * that one. `key` is what gets frozen onto each lead; `displayName` is what
 * people read, and is the only half that can be renamed later.
 */
export interface MetaSource {
  id: string;
  key: string;
  displayName: string;
  parentId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** What `GET /meta/sources` returns — roots with their children nested. */
export interface MetaSourceTree extends MetaSource {
  subSources: MetaSource[];
}

/** The shape included alongside a form or account so selects can be labelled. */
export type MetaSourceRef = Pick<MetaSource, "id" | "key" | "displayName">;

export interface MetaAccount {
  id: string;
  name: string;
  pageId: string;
  /** The token itself is never sent to the browser — only whether one is set. */
  hasToken: boolean;
  defaultSourceId: string | null;
  defaultSubSourceId: string | null;
  defaultCourseId: string | null;
  /** Joined in by the API — the catalogue rows behind the two ids above. */
  defaultSource?: MetaSourceRef | null;
  defaultSubSource?: MetaSourceRef | null;
  enabled: boolean;
  tokenStatus: MetaTokenStatus;
  tokenCheckedAt: string | null;
  lastSyncedAt: string | null;
  lastPolledAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  /** Only returned by validate-token. */
  pageName?: string | null;
}

/**
 * A form as a picker sees it — id, name, and just enough to tell two
 * similarly-named forms apart. Not the full `MetaForm`: the Meta screen needs
 * routing, backfill counters and sync state, and a trigger picker needs none
 * of it.
 */
export interface MetaFormOption {
  formId: string;
  name: string;
  pageName: string | null;
  active: boolean;
  leadCount: number;
}

export interface MetaForm {
  id: string;
  accountId: string;
  formId: string;
  name: string | null;
  status: string | null;
  sourceId: string | null;
  subSourceId: string | null;
  courseId: string | null;
  /** Joined in by the API, so a row can render without a second lookup. */
  source?: MetaSourceRef | null;
  subSource?: MetaSourceRef | null;
  active: boolean;
  leadCount: number;
  lastSeenAt: string | null;
  backfillStatus: MetaBackfillStatus | null;
  backfillTotal: number;
  backfillInserted: number;
  backfillAlreadyImported: number;
  backfillSkipped: number;
  backfillSince: string | null;
  backfillStartedAt: string | null;
  backfillFinishedAt: string | null;
  backfillError: string | null;
  /** Computed server-side: no source, no subSource and no course. */
  isUnmapped: boolean;
}

export interface MetaLead {
  id: string;
  metaLeadId: string;
  accountId: string;
  formId: string;
  pageId: string;
  formName: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  countryCode: string | null;
  status: MetaLeadStatus;
  source: string | null;
  subSource: string | null;
  sourceDisplayName: string | null;
  subSourceDisplayName: string | null;
  courseId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  adId: string | null;
  adName: string | null;
  /** Every form answer that was not name, email or phone. */
  fields: Record<string, string | string[]>;
  /** Facebook's timestamp. What the list sorts by — not `createdAt`. */
  sourceCreatedAt: string;
  importedVia: "poll" | "backfill";
  skipReason: string | null;
  createdAt: string;
  updatedAt: string;
  account?: { id: string; name: string; pageId: string } | null;
}

export interface MetaLeadDetail extends MetaLead {
  /** Only on the detail endpoint — the largest column in the table. */
  rawPayload: Record<string, unknown>;
  /**
   * The same email in the website `leads` table, if any.
   *
   * Resolved at read time only. The two pipelines never touch at write time,
   * so this is the whole of the cross-channel answer.
   */
  websiteLead: {
    id: string;
    name: string;
    email: string;
    source: string;
    status: string;
    createdAt: string;
  } | null;
}

export interface MetaFilterOption {
  id: string;
  name: string;
}

export interface MetaLeadFilters {
  accounts: MetaFilterOption[];
  forms: MetaFilterOption[];
  campaigns: MetaFilterOption[];
  adsets: MetaFilterOption[];
  ads: MetaFilterOption[];
  sources: {
    source: string | null;
    sourceDisplayName: string | null;
    subSource: string | null;
    subSourceDisplayName: string | null;
  }[];
}

export interface MetaLeadQuery {
  page?: number;
  limit?: number;
  search?: string;
  accountId?: string;
  formId?: string;
  campaignId?: string;
  adsetId?: string;
  adId?: string;
  status?: string;
  source?: string;
  subSource?: string;
  courseId?: string;
  from?: string;
  to?: string;
  sortBy?: "sourceCreatedAt" | "createdAt" | "name" | "status";
  sortDir?: "asc" | "desc";
}

export interface MetaSettings {
  id: string;
  pollEnabled: boolean;
  lastPollAt: string | null;
  lastSyncAt: string | null;
}

export interface MetaPollLog {
  id: string;
  accountId: string | null;
  formId: string | null;
  accountName: string | null;
  formName: string | null;
  fetchedCount: number;
  newLeads: number;
  /**
   * Facebook leads we had already stored. Expected to be non-zero — it is the
   * poll's overlap window working, not waste. Not the same as a lead whose
   * *status* is `duplicate`, which is a second submission by one person.
   */
  alreadyImported: number;
  skipped: number;
  failed: number;
  status: "success" | "error" | "backfill";
  error: string | null;
  createdAt: string;
}

export interface MetaStats {
  windowHours: number;
  runs: number;
  fetched: number;
  newLeads: number;
  alreadyImported: number;
  skipped: number;
  failed: number;
  errors: number;
  lastRunAt: string | null;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

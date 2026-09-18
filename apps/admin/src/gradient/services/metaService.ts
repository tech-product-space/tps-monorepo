import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";
import type {
  MetaAccount,
  MetaForm,
  MetaFormOption,
  MetaLead,
  MetaLeadDetail,
  MetaLeadFilters,
  MetaLeadQuery,
  MetaLeadStatus,
  MetaPollLog,
  MetaSettings,
  MetaSource,
  MetaSourceTree,
  MetaStats,
  PaginationMeta,
} from "@/gradient/types/meta";

const BASE = `${process.env.NEXT_PUBLIC_API_URL}/meta`;

export interface CreateMetaAccountPayload {
  name: string;
  pageId: string;
  /** Write-only. Omit on update to keep the token already stored. */
  pageToken?: string;
  defaultSourceId?: string | null;
  defaultSubSourceId?: string | null;
  defaultCourseId?: string | null;
  enabled?: boolean;
}

export interface UpdateMetaFormPayload {
  sourceId?: string | null;
  subSourceId?: string | null;
  courseId?: string | null;
  active?: boolean;
  /**
   * Also rewrite the attribution of leads this form has already imported.
   *
   * Defaults to false, and must: attribution is frozen at import so that a
   * remap cannot silently change what past reports were built on. Only send
   * true when someone has been asked and said yes.
   */
  reattributeExisting?: boolean;
}

/**
 * Drops empty values so a blank filter never reaches the query string.
 *
 * Takes an interface rather than `Record<string, unknown>` — TypeScript will
 * not assign an interface to an index signature, and widening the callers to
 * plain records would give up the typed query objects entirely.
 */
const toParams = <T extends object>(query: T) => {
  const params: Record<string, string> = {};

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params[key] = String(value);
  }

  return params;
};

export const metaService = {
  /* ── Leads: any authenticated admin ─────────────────────────────────── */

  listLeads: async (
    query: MetaLeadQuery = {},
  ): Promise<{ success: boolean; data: MetaLead[]; meta: PaginationMeta }> => {
    const response = await PrivateAxios.get(`${BASE}/leads`, {
      params: toParams(query),
    });
    return response.data;
  },

  /**
   * Options for the cascading filter selects.
   *
   * Passing `accountId` / `campaignId` / `adsetId` narrows the levels below —
   * picking a campaign should not leave you choosing from every ad set on the
   * account.
   */
  getFilters: async (scope: {
    accountId?: string;
    campaignId?: string;
    adsetId?: string;
  } = {}): Promise<{ success: boolean; data: MetaLeadFilters }> => {
    const response = await PrivateAxios.get(`${BASE}/leads/filters`, {
      params: toParams(scope),
    });
    return response.data;
  },

  getLead: async (
    id: string,
  ): Promise<{ success: boolean; data: MetaLeadDetail }> => {
    const response = await PrivateAxios.get(`${BASE}/leads/${id}`);
    return response.data;
  },

  /** Status is the only field the panel may change — the rest is Facebook's. */
  updateLeadStatus: async (id: string, status: MetaLeadStatus) => {
    const response = await PrivateAxios.patch(`${BASE}/leads/${id}`, { status });
    return response.data;
  },

  /**
   * CSV of the current filter set.
   *
   * Returned as a blob and saved by the caller rather than opened in a new tab:
   * the endpoint needs the Authorization header, which a plain
   * `window.open` would not send.
   */
  exportLeads: async (query: MetaLeadQuery = {}): Promise<Blob> => {
    const response = await PrivateAxios.get(`${BASE}/leads/export`, {
      params: toParams(query),
      responseType: "blob",
    });
    return response.data;
  },

  /* ── Source catalogue: any authenticated admin ──────────────────────── */

  /**
   * Sources with their sub sources nested.
   *
   * Managed from the Meta Leads screen, so it is not behind the Super Admin
   * gate — form mapping then picks from this rather than accepting free text.
   */
  listSources: async (
    includeInactive = false,
  ): Promise<{ success: boolean; data: MetaSourceTree[] }> => {
    const response = await PrivateAxios.get(`${BASE}/sources`, {
      params: includeInactive ? { includeInactive: "true" } : undefined,
    });
    return response.data;
  },

  /** Omit `parentId` for a source; pass one to add a sub source under it. */
  createSource: async (payload: {
    key: string;
    displayName: string;
    parentId?: string | null;
  }): Promise<{ success: boolean; message: string; data: MetaSource }> => {
    const response = await PrivateAxios.post(`${BASE}/sources`, payload);
    return response.data;
  },

  /** `key` is intentionally not editable — see the API comment on why. */
  updateSource: async (
    id: string,
    payload: { displayName?: string; isActive?: boolean },
  ) => {
    const response = await PrivateAxios.put(`${BASE}/sources/${id}`, payload);
    return response.data;
  },

  /** 409s when forms, page defaults or imported leads still reference it. */
  deleteSource: async (id: string) => {
    const response = await PrivateAxios.delete(`${BASE}/sources/${id}`);
    return response.data;
  },

  /* ── Configuration: Super Admin only ────────────────────────────────── */

  listAccounts: async (): Promise<{ success: boolean; data: MetaAccount[] }> => {
    const response = await PrivateAxios.get(`${BASE}/accounts`);
    return response.data;
  },

  createAccount: async (payload: CreateMetaAccountPayload) => {
    const response = await PrivateAxios.post(`${BASE}/accounts`, payload);
    return response.data;
  },

  updateAccount: async (
    id: string,
    payload: Partial<CreateMetaAccountPayload>,
  ) => {
    const response = await PrivateAxios.put(`${BASE}/accounts/${id}`, payload);
    return response.data;
  },

  deleteAccount: async (id: string) => {
    const response = await PrivateAxios.delete(`${BASE}/accounts/${id}`);
    return response.data;
  },

  validateToken: async (
    id: string,
  ): Promise<{ success: boolean; message: string; data: MetaAccount }> => {
    const response = await PrivateAxios.post(
      `${BASE}/accounts/${id}/validate-token`,
    );
    return response.data;
  },

  syncForms: async (id: string) => {
    const response = await PrivateAxios.post(`${BASE}/accounts/${id}/sync-forms`);
    return response.data;
  },

  /**
   * Every form across every account, flat.
   *
   * `listForms` is per-account because the Meta screen is organised that way —
   * connect a page, then map its forms. A workflow trigger has no account to
   * hang off: somebody choosing "start this when a form comes in" is thinking
   * about forms, not about which page they live under.
   */
  listAllForms: async (): Promise<{ success: boolean; data: MetaFormOption[] }> => {
    const res = await PrivateAxios.get(`${BASE}/forms`);
    return res.data;
  },

  listForms: async (
    accountId: string,
  ): Promise<{ success: boolean; data: MetaForm[] }> => {
    const response = await PrivateAxios.get(`${BASE}/accounts/${accountId}/forms`);
    return response.data;
  },

  updateForm: async (
    formId: string,
    payload: UpdateMetaFormPayload,
  ): Promise<{ success: boolean; message: string; reattributed: number }> => {
    const response = await PrivateAxios.put(`${BASE}/forms/${formId}`, payload);
    return response.data;
  },

  /** `since` omitted means all time. 409s when one is already running. */
  startBackfill: async (formId: string, since?: string) => {
    const response = await PrivateAxios.post(
      `${BASE}/forms/${formId}/backfill`,
      since ? { since } : {},
    );
    return response.data;
  },

  getSettings: async (): Promise<{ success: boolean; data: MetaSettings }> => {
    const response = await PrivateAxios.get(`${BASE}/settings`);
    return response.data;
  },

  setPollEnabled: async (pollEnabled: boolean) => {
    const response = await PrivateAxios.put(`${BASE}/settings`, { pollEnabled });
    return response.data;
  },

  listLogs: async (query: {
    page?: number;
    limit?: number;
    accountId?: string;
    formId?: string;
    status?: string;
    onlyInteresting?: boolean;
  } = {}): Promise<{
    success: boolean;
    data: MetaPollLog[];
    meta: PaginationMeta;
  }> => {
    const response = await PrivateAxios.get(`${BASE}/logs`, {
      params: toParams(query),
    });
    return response.data;
  },

  getStats: async (
    hours = 24,
    accountId?: string,
  ): Promise<{ success: boolean; data: MetaStats }> => {
    const response = await PrivateAxios.get(`${BASE}/stats`, {
      params: toParams({ hours, accountId }),
    });
    return response.data;
  },

  pollNow: async () => {
    const response = await PrivateAxios.post(`${BASE}/poll-now`);
    return response.data;
  },

  syncAll: async () => {
    const response = await PrivateAxios.post(`${BASE}/sync-all`);
    return response.data;
  },
};

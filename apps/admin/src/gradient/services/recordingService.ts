import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";
import {
  CreateRecordingPayload,
  RecordingLeadResponse,
} from "@/gradient/types/recording";

const BASE = `${process.env.NEXT_PUBLIC_API_URL}/recordings`;

export const recordingService = {
  /* ── recordings ───────────────────────────────────────────────────────── */

  getAllRecordings: async (params?: {
    page?: number;
    limit?: number;
    q?: string;
    categoryId?: string;
    isPublished?: boolean;
    /** One of `RECORDING_FORMATS`. */
    format?: string;
    sort?: string;
  }) => {
    const response = await PrivateAxios.get(`${BASE}/admin/recordings`, {
      params,
    });
    return response.data;
  },

  getRecordingById: async (id: string) => {
    const response = await PrivateAxios.get(`${BASE}/admin/recordings/${id}`);
    return response.data;
  },

  /**
   * Unwrapped to `{ available }`. `useSlugAvailability` reads `response.available`
   * and falls back to `true` when it is undefined — handing it the whole
   * envelope would make every slug look free, including taken ones.
   */
  checkSlugAvailability: async (slug: string, excludeId?: string) => {
    const response = await PrivateAxios.get(`${BASE}/admin/slug-availability`, {
      params: { slug, excludeId },
    });
    return response.data?.data;
  },

  createRecording: async (data: CreateRecordingPayload) => {
    const response = await PrivateAxios.post(`${BASE}/admin/create`, data);
    return response.data;
  },

  updateRecording: async (
    id: string,
    data: Partial<CreateRecordingPayload>,
  ) => {
    const response = await PrivateAxios.put(
      `${BASE}/admin/recordings/${id}`,
      data,
    );
    return response.data;
  },

  toggleRecordingStatus: async (id: string) => {
    const response = await PrivateAxios.patch(
      `${BASE}/admin/recordings/${id}/toggle-status`,
    );
    return response.data;
  },

  deleteRecording: async (id: string) => {
    const response = await PrivateAxios.delete(
      `${BASE}/admin/recordings/${id}`,
    );
    return response.data;
  },

  /* ── categories ───────────────────────────────────────────────────────── */

  getCategories: async () => {
    const response = await PrivateAxios.get(`${BASE}/admin/categories`);
    return response.data;
  },

  createCategory: async (data: {
    name: string;
    slug?: string;
    description?: string;
  }) => {
    const response = await PrivateAxios.post(`${BASE}/admin/categories`, data);
    return response.data;
  },

  updateCategory: async (
    id: string,
    data: { name?: string; slug?: string; isActive?: boolean; description?: string },
  ) => {
    const response = await PrivateAxios.put(
      `${BASE}/admin/categories/${id}`,
      data,
    );
    return response.data;
  },

  /** One write for the whole order — see the backend controller for why. */
  reorderCategories: async (ids: string[]) => {
    const response = await PrivateAxios.patch(
      `${BASE}/admin/categories/reorder`,
      { ids },
    );
    return response.data;
  },

  deleteCategory: async (id: string) => {
    const response = await PrivateAxios.delete(
      `${BASE}/admin/categories/${id}`,
    );
    return response.data;
  },

  /* ── preview ──────────────────────────────────────────────────────────── */

  /**
   * MINT A PREVIEW LINK TOKEN
   *
   * Single-use and minutes-long. Exchanged by the public site for a session
   * cookie, which is what actually lifts the live filters and releases the
   * gated video — see `../FREE_COURSE_PREVIEW_PLAN.md` §3. Mint one per click
   * rather than caching: a token held in component state goes stale in fifteen
   * minutes and fails on the one click that matters.
   */
  createPreviewToken: async (
    recordingId: string,
  ): Promise<{ success: boolean; data: { token: string; slug: string } }> => {
    const response = await PrivateAxios.post(
      `${BASE}/admin/recordings/${recordingId}/preview-token`,
    );
    return response.data;
  },

  /* ── leads ────────────────────────────────────────────────────────────── */

  /**
   * The people who passed the gate on one recording.
   *
   * `email` is a partial, case-insensitive match server-side, so it backs a
   * search box rather than requiring a whole address. It is the only field
   * worth searching: the gate asks for an address and nothing else.
   */
  getRecordingLeads: async (
    recordingId: string,
    page = 1,
    limit = 10,
    email?: string,
  ): Promise<RecordingLeadResponse> => {
    const response = await PrivateAxios.get(`${BASE}/admin/leads`, {
      params: { recordingId, page, limit, email: email || undefined },
    });
    return response.data;
  },
};

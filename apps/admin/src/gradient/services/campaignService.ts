import { PrivateAxios } from "@/gradient/helpers/PrivateAxios";
import { cleanHtml } from "@/gradient/lib/cleanHtml";
import type {
  AudienceSources,
  Campaign,
  CampaignPreview,
  CampaignSender,
  CampaignStats,
  RecipientFilters,
} from "@/gradient/types/campaign";
import type { IPaginationMeta } from "@/gradient/types/pagination";

const BASE = `${process.env.NEXT_PUBLIC_API_URL}/campaigns`;

export type CampaignUpdatePayload = Partial<{
  name: string;
  subject: string;
  body: string;
  senderEmail: string;
  senderName: string;
  recipientFilters: RecipientFilters;
}>;

export const campaignService = {
  async list(params?: { status?: string | null; page?: number; limit?: number }) {
    const res = await PrivateAxios.get(BASE, { params });
    return res.data as { data: Campaign[]; meta: IPaginationMeta };
  },

  async get(id: string) {
    const res = await PrivateAxios.get(`${BASE}/${id}`);
    return (res.data as { data: Campaign }).data;
  },

  async create(name: string) {
    const res = await PrivateAxios.post(BASE, { name });
    return (res.data as { data: Campaign }).data;
  },

  async update(id: string, payload: CampaignUpdatePayload) {
    // The editor's HTML goes through the same sanitiser the reminder service
    // uses, so campaign bodies and reminder bodies cannot drift apart.
    const sanitised = payload.body
      ? { ...payload, body: cleanHtml(payload.body) }
      : payload;

    const res = await PrivateAxios.patch(`${BASE}/${id}`, sanitised);
    return (res.data as { data: Campaign }).data;
  },

  /** Copies content and the audience query. Always lands as a fresh draft. */
  async duplicate(id: string, name?: string) {
    const res = await PrivateAxios.post(`${BASE}/${id}/duplicate`, { name });
    return (res.data as { data: Campaign }).data;
  },

  async remove(id: string) {
    const res = await PrivateAxios.delete(`${BASE}/${id}`);
    return res.data;
  },

  async senders() {
    const res = await PrivateAxios.get(`${BASE}/senders`);
    return (res.data as { data: CampaignSender[] }).data;
  },

  /** One request for the whole audience selector. */
  async sources() {
    const res = await PrivateAxios.get(`${BASE}/sources`);
    return (res.data as { data: AudienceSources }).data;
  },

  /** Paginated server-side — a large audience must not be shipped whole. */
  async preview(id: string, params?: { page?: number; limit?: number }) {
    const res = await PrivateAxios.get(`${BASE}/${id}/preview`, { params });
    return res.data as { data: CampaignPreview; meta: IPaginationMeta };
  },

  async stats(id: string) {
    const res = await PrivateAxios.get(`${BASE}/${id}/stats`);
    return (res.data as { data: CampaignStats }).data;
  },

  /** Omit `scheduledAt` to send immediately. */
  async schedule(id: string, scheduledAt?: string) {
    const res = await PrivateAxios.post(`${BASE}/${id}/schedule`, {
      scheduledAt,
    });
    return res.data;
  },

  async cancel(id: string) {
    const res = await PrivateAxios.post(`${BASE}/${id}/cancel`);
    return res.data;
  },

  async sendTest(id: string, payload: { to: string; name?: string }) {
    const res = await PrivateAxios.post(`${BASE}/${id}/send-test`, payload);
    return res.data;
  },

  async retryFailed(id: string) {
    const res = await PrivateAxios.post(`${BASE}/${id}/retry-failed`);
    return res.data;
  },
};
